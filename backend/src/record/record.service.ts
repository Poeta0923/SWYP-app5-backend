import { Injectable } from '@nestjs/common';
import {
  MediaFileType,
  MediaFileUsage,
  RecordType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service, type UploadedS3File } from '../s3/s3.service';
import { OpenAITranscriptionService } from './openai-transcription.service';

export interface VoiceRecordFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
}

export interface VoiceRecordSttResponse {
  id: string;
}

interface UploadedVoiceStorageFile extends UploadedS3File {
  originalName?: string;
}

@Injectable()
export class RecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly openAITranscriptionService: OpenAITranscriptionService,
  ) {}

  async createVoiceRecordFromStt(
    userId: string,
    file: VoiceRecordFile,
    recordMemo: string,
  ): Promise<VoiceRecordSttResponse> {
    const uploadedFileKeys: string[] = [];

    try {
      const uploadedVoiceFile = await this.uploadVoiceFile(
        userId,
        file,
        uploadedFileKeys,
      );
      const transcribedText =
        await this.openAITranscriptionService.transcribe(file);

      const createdRecordId = await this.prisma.$transaction(async (tx) => {
        const voiceFile = await tx.mediaFile.create({
          data: this.toVoiceMediaFileCreateData(userId, uploadedVoiceFile),
        });
        const record = await tx.record.create({
          data: {
            userId,
            type: RecordType.VOICE,
            content: transcribedText,
            voiceFileId: voiceFile.id,
          },
        });

        await tx.recordMemo.create({
          data: {
            userId,
            recordId: record.id,
            content: recordMemo.trim(),
          },
        });

        return record.id;
      });

      return {
        id: createdRecordId,
      };
    } catch (error) {
      await this.deleteUploadedFiles(uploadedFileKeys);
      throw error;
    }
  }

  private async uploadVoiceFile(
    userId: string,
    file: VoiceRecordFile,
    uploadedFileKeys: string[],
  ): Promise<UploadedVoiceStorageFile> {
    const uploadedFile = await this.s3Service.uploadFile({
      body: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      prefix: `records/${userId}/voice`,
    });
    uploadedFileKeys.push(uploadedFile.key);

    return {
      ...uploadedFile,
      originalName: file.originalname,
    };
  }

  private toVoiceMediaFileCreateData(
    userId: string,
    file: UploadedVoiceStorageFile,
  ) {
    return {
      userId,
      type: MediaFileType.AUDIO,
      usage: MediaFileUsage.RECORD_VOICE,
      bucket: file.bucket,
      s3Key: file.key,
      contentType: file.contentType,
      sizeBytes: file.size,
      originalName: file.originalName,
    };
  }

  private async deleteUploadedFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    await this.s3Service.deleteFiles(keys).catch(() => undefined);
  }
}
