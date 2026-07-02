import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MediaFileType,
  MediaFileUsage,
  Prisma,
  RecordType,
} from '../../generated/prisma/client';
import type { HomeRecordResponse } from '../home/home.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service, type UploadedS3File } from '../s3/s3.service';
import type { UpdateVoiceRecordDto } from './dto/update-voice-record.dto';
import { OpenAISummaryService } from './openai-summary.service';
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

export interface VoiceRecordSummaryResponse {
  recordId: string;
  title: string;
  createdAt: string;
  keyword: string[];
  content: string;
  voiceFileUrl: string | null;
  recordMemo: string;
}

export interface VoiceRecordDetailPersonResponse {
  id: string;
  name: string;
  image: string | null;
}

export interface VoiceRecordDetailResponse {
  recordId: string;
  title: string;
  createdAt: string;
  recordPeople: VoiceRecordDetailPersonResponse[];
  recordKeywords: string[];
  content: string;
  recordMemo: string | null;
  voiceFileUrl: string | null;
}

export interface VoiceRecordPersonResponse {
  id: string;
  name: string;
}

export interface VoiceRecordUpdateResponse {
  recordId: string;
  title: string;
  recordMemo: string | null;
  people: VoiceRecordPersonResponse[];
  updatedAt: string;
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
    private readonly openAISummaryService: OpenAISummaryService,
  ) {}

  async getRecords(userId: string): Promise<HomeRecordResponse[]> {
    const records = await this.prisma.record.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        title: true,
        createdAt: true,
        voiceDurationSeconds: true,
        people: {
          select: {
            person: {
              select: {
                name: true,
              },
            },
          },
          orderBy: {
            person: {
              name: Prisma.SortOrder.asc,
            },
          },
        },
      },
      orderBy: { createdAt: Prisma.SortOrder.desc },
    });

    return records.map((record) => ({
      id: record.id,
      type: record.type,
      title: record.title,
      people: record.people.map(({ person }) => person.name),
      createdAt: record.createdAt.toISOString(),
      voiceDuration:
        record.type === RecordType.VOICE
          ? this.toMinuteSecond(record.voiceDurationSeconds)
          : null,
    }));
  }

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

  async getVoiceRecord(
    userId: string,
    recordId: string,
  ): Promise<VoiceRecordDetailResponse> {
    const record = await this.prisma.record.findFirst({
      where: {
        id: recordId,
        userId,
        type: RecordType.VOICE,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        content: true,
        people: {
          select: {
            person: {
              select: {
                id: true,
                name: true,
                profileImageFile: {
                  select: {
                    s3Key: true,
                  },
                },
              },
            },
          },
          orderBy: {
            person: {
              name: Prisma.SortOrder.asc,
            },
          },
        },
        keywords: {
          select: {
            name: true,
          },
          orderBy: {
            name: Prisma.SortOrder.asc,
          },
        },
        recordMemo: {
          select: {
            content: true,
          },
        },
        voiceFile: {
          select: {
            s3Key: true,
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'VOICE_RECORD_NOT_FOUND',
        message: '음성 기록을 찾을 수 없습니다.',
        recordId,
      });
    }

    return {
      recordId: record.id,
      title: record.title,
      createdAt: record.createdAt.toISOString(),
      recordPeople: record.people.map(({ person }) => ({
        id: person.id,
        name: person.name,
        image: this.toSignedMediaFileUrl(person.profileImageFile),
      })),
      recordKeywords: record.keywords.map((keyword) => keyword.name),
      content: record.content ?? '',
      recordMemo: record.recordMemo?.content ?? null,
      voiceFileUrl: this.toSignedMediaFileUrl(record.voiceFile),
    };
  }

  async summarizeVoiceRecord(
    userId: string,
    recordId: string,
  ): Promise<VoiceRecordSummaryResponse> {
    const record = await this.prisma.record.findFirst({
      where: {
        id: recordId,
        userId,
        type: RecordType.VOICE,
      },
      select: {
        id: true,
        content: true,
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'VOICE_RECORD_NOT_FOUND',
        message: '요약할 음성 기록을 찾을 수 없습니다.',
        recordId,
      });
    }

    const content = record.content?.trim();

    if (!content) {
      throw new BadRequestException({
        code: 'VOICE_RECORD_CONTENT_EMPTY',
        message: '요약할 기록 내용이 없습니다.',
        recordId,
      });
    }

    const summaryResult = await this.openAISummaryService.summarize(content);

    const updatedRecord = await this.prisma.$transaction(async (tx) => {
      await tx.recordKeyword.deleteMany({
        where: {
          recordId: record.id,
          userId,
        },
      });

      await tx.recordKeyword.createMany({
        data: summaryResult.keywords.map((keyword) => ({
          userId,
          recordId: record.id,
          name: keyword,
        })),
        skipDuplicates: true,
      });

      return tx.record.update({
        where: {
          id: record.id,
        },
        data: {
          content: summaryResult.summary,
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          content: true,
          keywords: {
            select: {
              name: true,
            },
            orderBy: {
              name: 'asc',
            },
          },
          recordMemo: {
            select: {
              content: true,
            },
          },
          voiceFile: {
            select: {
              s3Key: true,
            },
          },
        },
      });
    });

    return {
      recordId: updatedRecord.id,
      title: updatedRecord.title,
      createdAt: updatedRecord.createdAt.toISOString(),
      keyword: updatedRecord.keywords.map((keyword) => keyword.name),
      content: updatedRecord.content ?? '',
      voiceFileUrl: this.toSignedMediaFileUrl(updatedRecord.voiceFile),
      recordMemo: updatedRecord.recordMemo?.content ?? '',
    };
  }

  async updateVoiceRecord(
    userId: string,
    recordId: string,
    item: UpdateVoiceRecordDto,
  ): Promise<VoiceRecordDetailResponse> {
    if (
      !this.hasOwn(item, 'title') &&
      !this.hasOwn(item, 'recordMemo') &&
      !this.hasOwn(item, 'personIds')
    ) {
      throw new BadRequestException({
        code: 'VOICE_RECORD_UPDATE_EMPTY',
        message: '수정할 필드를 하나 이상 입력해 주세요.',
      });
    }

    await this.findVoiceRecordForUpdateOrThrow(userId, recordId);

    if (this.hasOwn(item, 'personIds')) {
      await this.assertPeopleExist(userId, item.personIds ?? []);
    }

    const updatedRecord = await this.prisma.$transaction(async (tx) => {
      const recordUpdateData: Prisma.RecordUpdateInput = {
        updatedAt: new Date(),
      };

      if (this.hasOwn(item, 'title')) {
        recordUpdateData.title = item.title;
      }

      await tx.record.update({
        where: {
          id_userId: {
            id: recordId,
            userId,
          },
        },
        data: recordUpdateData,
      });

      if (this.hasOwn(item, 'recordMemo')) {
        const recordMemo = item.recordMemo;

        if (recordMemo === undefined) {
          throw new BadRequestException({
            code: 'VOICE_RECORD_MEMO_INVALID',
            message: 'recordMemo 값이 올바르지 않습니다.',
          });
        }

        if (recordMemo === null) {
          await tx.recordMemo.deleteMany({
            where: {
              recordId,
              userId,
            },
          });
        } else {
          await tx.recordMemo.upsert({
            where: {
              recordId_userId: {
                recordId,
                userId,
              },
            },
            create: {
              recordId,
              userId,
              content: recordMemo,
            },
            update: {
              content: recordMemo,
            },
          });
        }
      }

      if (this.hasOwn(item, 'personIds')) {
        await tx.recordPerson.deleteMany({
          where: {
            recordId,
            userId,
          },
        });

        if (item.personIds && item.personIds.length > 0) {
          await tx.recordPerson.createMany({
            data: item.personIds.map((personId) => ({
              recordId,
              personId,
              userId,
            })),
            skipDuplicates: true,
          });
        }
      }

      return tx.record.findFirst({
        where: {
          id: recordId,
          userId,
          type: RecordType.VOICE,
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          content: true,
          keywords: {
            select: {
              name: true,
            },
            orderBy: {
              name: Prisma.SortOrder.asc,
            },
          },
          recordMemo: {
            select: {
              content: true,
            },
          },
          voiceFile: {
            select: {
              s3Key: true,
            },
          },
          people: {
            select: {
              person: {
                select: {
                  id: true,
                  name: true,
                  profileImageFile: {
                    select: {
                      s3Key: true,
                    },
                  },
                },
              },
            },
            orderBy: {
              person: {
                name: Prisma.SortOrder.asc,
              },
            },
          },
        },
      });
    });

    if (!updatedRecord) {
      throw new NotFoundException({
        code: 'VOICE_RECORD_NOT_FOUND',
        message: '수정할 음성 기록을 찾을 수 없습니다.',
        recordId,
      });
    }

    return {
      recordId: updatedRecord.id,
      title: updatedRecord.title,
      createdAt: updatedRecord.createdAt.toISOString(),
      recordPeople: updatedRecord.people.map(({ person }) => ({
        id: person.id,
        name: person.name,
        image: this.toSignedMediaFileUrl(person.profileImageFile),
      })),
      recordKeywords: updatedRecord.keywords.map((keyword) => keyword.name),
      content: updatedRecord.content ?? '',
      recordMemo: updatedRecord.recordMemo?.content ?? null,
      voiceFileUrl: this.toSignedMediaFileUrl(updatedRecord.voiceFile),
    };
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

  private toMinuteSecond(seconds: number | null): string | null {
    if (seconds === null) {
      return null;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;

    return `${this.padTimeUnit(minutes)}:${this.padTimeUnit(remainingSeconds)}`;
  }

  private padTimeUnit(value: number): string {
    return value.toString().padStart(2, '0');
  }

  private toSignedMediaFileUrl(
    mediaFile: { s3Key: string } | null,
  ): string | null {
    return mediaFile ? this.s3Service.getSignedUrl(mediaFile.s3Key) : null;
  }

  private async findVoiceRecordForUpdateOrThrow(
    userId: string,
    recordId: string,
  ): Promise<void> {
    const record = await this.prisma.record.findFirst({
      where: {
        id: recordId,
        userId,
        type: RecordType.VOICE,
      },
      select: {
        id: true,
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'VOICE_RECORD_NOT_FOUND',
        message: '수정할 음성 기록을 찾을 수 없습니다.',
        recordId,
      });
    }
  }

  private async assertPeopleExist(
    userId: string,
    personIds: string[],
  ): Promise<void> {
    if (personIds.length === 0) {
      return;
    }

    const people = await this.prisma.person.findMany({
      where: {
        id: {
          in: personIds,
        },
        userId,
      },
      select: {
        id: true,
      },
    });

    if (people.length === personIds.length) {
      return;
    }

    const existingPersonIds = new Set(people.map((person) => person.id));
    const missingPersonIds = personIds.filter(
      (personId) => !existingPersonIds.has(personId),
    );

    throw new BadRequestException({
      code: 'RECORD_PERSON_NOT_FOUND',
      message: '연결할 인물을 찾을 수 없습니다.',
      personIds: missingPersonIds,
    });
  }

  private hasOwn<T extends object, K extends PropertyKey>(
    object: T,
    key: K,
  ): object is T & Record<K, unknown> {
    return Object.prototype.hasOwnProperty.call(object, key);
  }

  private async deleteUploadedFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    await this.s3Service.deleteFiles(keys).catch(() => undefined);
  }
}
