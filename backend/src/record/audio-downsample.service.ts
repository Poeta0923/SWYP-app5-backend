import { Injectable } from '@nestjs/common';
import { spawn } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AUDIO_DOWNSAMPLE_CHANNELS,
  AUDIO_DOWNSAMPLE_SAMPLE_RATE,
} from './record.constants';

export interface DownsampledAudio {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
}

/**
 * 업로드된 음성 파일을 ffmpeg로 16kHz mono mp3로 다운샘플한다.
 * 음성 인식엔 이 정도 품질이면 충분하고, 용량이 크게 줄어 OpenAI STT의
 * 25MB 제한을 분할 없이 우회할 수 있다.
 */
@Injectable()
export class AudioDownsampleService {
  /**
   * @param input 원본 오디오 버퍼 (m4a 등)
   * @returns 다운샘플된 mp3 버퍼와 STT 전송용 메타데이터
   * @throws ffmpeg 실행 실패 시
   */
  async downsample(input: Buffer): Promise<DownsampledAudio> {
    // m4a(MP4)는 moov atom 위치 때문에 stdin 파이프로는 seek가 안 돼
    // "moov atom not found"로 실패한다. 입력은 반드시 임시 파일로 넘긴다.
    const workDir = await mkdtemp(join(tmpdir(), 'stt-downsample-'));
    const inputPath = join(workDir, 'input');

    try {
      await writeFile(inputPath, input);
      const buffer = await this.runFfmpeg(inputPath);

      return {
        buffer,
        mimetype: 'audio/mpeg',
        originalname: 'recording.mp3',
      };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  private runFfmpeg(inputPath: string): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-nostdin',
        '-loglevel',
        'error',
        '-i',
        inputPath,
        '-vn',
        '-ac',
        String(AUDIO_DOWNSAMPLE_CHANNELS),
        '-ar',
        String(AUDIO_DOWNSAMPLE_SAMPLE_RATE),
        '-f',
        'mp3',
        'pipe:1',
      ]);

      const stdoutChunks: Buffer[] = [];
      const stderrChunks: Buffer[] = [];

      ffmpeg.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
      ffmpeg.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

      ffmpeg.on('error', (error) => reject(error));
      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve(Buffer.concat(stdoutChunks));
          return;
        }

        const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
        reject(
          new Error(
            `ffmpeg exited with code ${code ?? 'null'}${stderr ? `: ${stderr}` : ''}`,
          ),
        );
      });
    });
  }
}
