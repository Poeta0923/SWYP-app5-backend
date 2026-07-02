import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_OPENAI_TRANSCRIPTION_MODEL,
  OPENAI_API_KEY_ENV,
  OPENAI_AUDIO_TRANSCRIPTIONS_URL,
  OPENAI_TRANSCRIPTION_MODEL_ENV,
} from './record.constants';

export interface TranscriptionAudioFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
}

@Injectable()
export class OpenAITranscriptionService {
  constructor(private readonly configService: ConfigService) {}

  async transcribe(file: TranscriptionAudioFile): Promise<string> {
    const response = await fetch(OPENAI_AUDIO_TRANSCRIPTIONS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.getRequiredConfig(OPENAI_API_KEY_ENV)}`,
      },
      body: this.createTranscriptionFormData(file),
    });

    if (!response.ok) {
      throw new BadGatewayException({
        code: 'OPENAI_TRANSCRIPTION_FAILED',
        message: '음성 파일 텍스트 변환에 실패했습니다.',
        statusCode: response.status,
      });
    }

    const responseBody = (await response.json()) as { text?: unknown };
    const text =
      typeof responseBody.text === 'string' ? responseBody.text.trim() : '';

    if (!text) {
      throw new BadGatewayException({
        code: 'OPENAI_TRANSCRIPTION_EMPTY',
        message: '음성 파일에서 변환된 텍스트를 찾을 수 없습니다.',
      });
    }

    return text;
  }

  private createTranscriptionFormData(file: TranscriptionAudioFile): FormData {
    const formData = new FormData();
    const audioArrayBuffer = file.buffer.buffer.slice(
      file.buffer.byteOffset,
      file.buffer.byteOffset + file.buffer.byteLength,
    ) as ArrayBuffer;
    const audioBlob = new Blob([audioArrayBuffer], {
      type: file.mimetype || 'audio/mp4',
    });

    formData.append('file', audioBlob, file.originalname ?? 'recording.m4a');
    formData.append('model', this.getTranscriptionModel());
    formData.append('response_format', 'json');

    return formData;
  }

  private getTranscriptionModel(): string {
    return (
      this.configService.get<string>(OPENAI_TRANSCRIPTION_MODEL_ENV) ??
      DEFAULT_OPENAI_TRANSCRIPTION_MODEL
    );
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key);

    if (!value) {
      throw new Error(`${key} is required to use OpenAI transcription.`);
    }

    return value;
  }
}
