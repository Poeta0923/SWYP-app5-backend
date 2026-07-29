import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SpeechClient, protos } from '@google-cloud/speech';
import {
  GOOGLE_CLOUD_CREDENTIALS_JSON_ENV,
  GOOGLE_CLOUD_PROJECT_ENV,
  GOOGLE_STT_LANGUAGE_CODE,
  GOOGLE_STT_MAX_INLINE_BYTES,
  GOOGLE_STT_MAX_SPEAKER_COUNT,
  GOOGLE_STT_MIN_SPEAKER_COUNT,
  GOOGLE_STT_MODEL,
  GOOGLE_STT_TIMEOUT_MS,
} from './record.constants';

/** 한 화자의 연속 발화. speaker는 Google STT의 speakerTag(1..N). */
export interface TranscriptSegment {
  speaker: number;
  text: string;
}

/** 화자 분리 전사 결과. text는 요약 입력용 전체 전사, segments는 화자별 발화. */
export interface DiarizedTranscription {
  text: string;
  segments: TranscriptSegment[];
}

type IWordInfo = protos.google.cloud.speech.v1.IWordInfo;
type ILongRunningRecognizeResponse =
  protos.google.cloud.speech.v1.ILongRunningRecognizeResponse;

/**
 * 화자 태그가 붙은 단어 목록을 연속 발화 세그먼트로 묶는다.
 * 화자 분리 결과는 마지막 result에 전체 오디오의 단어별 speakerTag를 담아 오므로,
 * 앞에서부터 훑으며 speaker가 바뀌는 지점마다 새 세그먼트를 연다.
 *
 * @param words Google STT WordInfo 배열(speakerTag 포함)
 * @returns 순서가 보존된 화자별 발화 세그먼트
 */
export function groupWordsBySpeaker(words: IWordInfo[]): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  for (const info of words) {
    const word = (info.word ?? '').trim();
    if (!word) continue;
    const speaker = info.speakerTag ?? 0;

    const last = segments[segments.length - 1];
    if (last && last.speaker === speaker) {
      last.text += ` ${word}`;
    } else {
      segments.push({ speaker, text: word });
    }
  }

  return segments.map((s) => ({ speaker: s.speaker, text: s.text.trim() }));
}

/**
 * Google Cloud Speech-to-Text로 화자 분리 전사를 수행한다(Premium 전용).
 * longRunningRecognize에 오디오를 인라인(base64)으로 넘겨 GCS 없이 처리한다.
 */
@Injectable()
export class GoogleSpeechTranscriptionService {
  private readonly logger = new Logger(GoogleSpeechTranscriptionService.name);
  private client?: SpeechClient;

  constructor(private readonly configService: ConfigService) {}

  /**
   * 다운샘플된 오디오를 화자 분리 전사한다.
   *
   * @param audioBuffer 16kHz mono mp3 버퍼(record.constants 다운샘플 결과)
   * @returns 전체 전사 텍스트 + 화자별 세그먼트
   * @throws BadGatewayException STT 실패/타임아웃/빈 결과/용량 초과 시
   */
  async transcribeWithDiarization(
    audioBuffer: Buffer,
  ): Promise<DiarizedTranscription> {
    if (audioBuffer.byteLength > GOOGLE_STT_MAX_INLINE_BYTES) {
      throw new BadGatewayException({
        code: 'GOOGLE_STT_TOO_LARGE',
        message: '화자 분리 처리 가능한 오디오 용량을 초과했습니다.',
      });
    }

    const request: protos.google.cloud.speech.v1.ILongRunningRecognizeRequest =
      {
        config: {
          encoding:
            protos.google.cloud.speech.v1.RecognitionConfig.AudioEncoding.MP3,
          sampleRateHertz: 16000,
          languageCode: GOOGLE_STT_LANGUAGE_CODE,
          model: GOOGLE_STT_MODEL,
          enableAutomaticPunctuation: true,
          diarizationConfig: {
            enableSpeakerDiarization: true,
            minSpeakerCount: GOOGLE_STT_MIN_SPEAKER_COUNT,
            maxSpeakerCount: GOOGLE_STT_MAX_SPEAKER_COUNT,
          },
        },
        audio: { content: audioBuffer },
      };

    let response: ILongRunningRecognizeResponse;
    try {
      const [operation] = await this.getClient().longRunningRecognize(request);
      [response] = await this.withTimeout(
        operation.promise(),
        GOOGLE_STT_TIMEOUT_MS,
      );
    } catch (error) {
      if (error instanceof BadGatewayException) throw error;
      this.logger.error(
        'Google STT 화자 분리 전사 실패',
        error instanceof Error ? error.stack : String(error),
      );
      throw new BadGatewayException({
        code: 'GOOGLE_STT_FAILED',
        message: '화자 분리 음성 전사에 실패했습니다.',
      });
    }

    const words = this.extractDiarizedWords(response);
    const segments = groupWordsBySpeaker(words);
    const text = this.joinTranscript(response) || this.joinSegments(segments);

    if (!text) {
      throw new BadGatewayException({
        code: 'GOOGLE_STT_EMPTY',
        message: '음성 파일에서 변환된 텍스트를 찾을 수 없습니다.',
      });
    }

    return { text, segments };
  }

  /** 화자 분리 단어 목록을 담은 result를 뒤에서부터 찾는다(화자 태그는 마지막 result에 온다). */
  private extractDiarizedWords(
    response: ILongRunningRecognizeResponse,
  ): IWordInfo[] {
    const results = response.results ?? [];
    for (let i = results.length - 1; i >= 0; i--) {
      const words = results[i].alternatives?.[0]?.words;
      if (words && words.length > 0) return words;
    }
    return [];
  }

  /** 각 result의 최상위 대안 transcript를 이어붙여 전체 전사를 만든다. */
  private joinTranscript(response: ILongRunningRecognizeResponse): string {
    return (response.results ?? [])
      .map((r) => r.alternatives?.[0]?.transcript ?? '')
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private joinSegments(segments: TranscriptSegment[]): string {
    return segments
      .map((s) => s.text)
      .join(' ')
      .trim();
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new BadGatewayException({
              code: 'GOOGLE_STT_TIMEOUT',
              message: '화자 분리 음성 전사가 시간 내에 완료되지 않았습니다.',
            }),
          ),
        ms,
      );
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** SpeechClient를 지연 초기화한다. 자격증명은 평문 JSON env에서 읽는다. */
  private getClient(): SpeechClient {
    if (this.client) return this.client;

    const raw = this.configService.get<string>(
      GOOGLE_CLOUD_CREDENTIALS_JSON_ENV,
    );
    if (!raw) {
      throw new Error(
        `${GOOGLE_CLOUD_CREDENTIALS_JSON_ENV} is required for Google STT diarization.`,
      );
    }

    let credentials: { client_email?: string; private_key?: string };
    try {
      credentials = JSON.parse(raw) as {
        client_email?: string;
        private_key?: string;
      };
    } catch {
      throw new Error(
        `${GOOGLE_CLOUD_CREDENTIALS_JSON_ENV} is not valid JSON.`,
      );
    }

    this.client = new SpeechClient({
      projectId: this.configService.get<string>(GOOGLE_CLOUD_PROJECT_ENV),
      credentials,
    });
    return this.client;
  }
}
