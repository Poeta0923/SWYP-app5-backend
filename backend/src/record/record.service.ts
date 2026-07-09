import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  MediaFileType,
  MediaFileUsage,
  Prisma,
  RecordType,
} from '../../generated/prisma/client';
import type { HomeRecordResponse } from '../home/home.service';
import { PrismaService } from '../prisma/prisma.service';
import { PiiCryptoService } from '../privacy/pii-crypto.service';
import { S3Service, type UploadedS3File } from '../s3/s3.service';
import type { CreateTextRecordDto } from './dto/create-text-record.dto';
import type { UpdateTextRecordDto } from './dto/update-text-record.dto';
import type { UpdateVoiceRecordDto } from './dto/update-voice-record.dto';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export interface VoiceRecordFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
}

export interface VoiceRecordSttResponse {
  id: string;
}

export interface TextRecordPersonResponse {
  id: string;
  name: string;
  image: string | null;
}

export interface TextRecordCreateResponse {
  recordId: string;
  title: string;
  createdAt: string;
  content: string;
  bookMark: boolean;
  people: TextRecordPersonResponse[];
}

export interface TextRecordDetailResponse extends TextRecordCreateResponse {
  schedule: VoiceRecordScheduleResponse | null;
}

export interface VoiceRecordSchedulePersonResponse {
  id: string;
  name: string;
  image: string | null;
}

export interface VoiceRecordScheduleResponse {
  scheduleId: string;
  title: string;
  scheduleTime: string;
  dDay: string;
  people: VoiceRecordSchedulePersonResponse[];
}

export interface VoiceRecordSummaryResponse {
  recordId: string;
  title: string;
  createdAt: string;
  keyword: string[];
  content: string;
  bookMark: boolean;
  voiceFileUrl: string | null;
  recordMemo: string | null;
  schedule: VoiceRecordScheduleResponse | null;
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
  bookMark: boolean;
  recordMemo: string | null;
  voiceFileUrl: string | null;
  schedule: VoiceRecordScheduleResponse | null;
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

export interface DeleteRecordResult {
  success: true;
}

interface UploadedVoiceStorageFile extends UploadedS3File {
  originalName?: string;
}

type VoiceRecordScheduleData = {
  id: string;
  title: string;
  scheduleTime: Date;
  people: {
    person: {
      id: string;
      name: string;
      profileImageFile: { s3Key: string } | null;
    };
  }[];
};

@Injectable()
export class RecordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    private readonly openAITranscriptionService: OpenAITranscriptionService,
    private readonly openAISummaryService: OpenAISummaryService,
    @Optional()
    private readonly piiCryptoService: PiiCryptoService = new PiiCryptoService(),
  ) {}

  async getRecords(userId: string): Promise<HomeRecordResponse[]> {
    const records = await this.prisma.record.findMany({
      where: { userId },
      select: {
        id: true,
        type: true,
        title: true,
        createdAt: true,
        bookMark: true,
        voiceDurationSeconds: true,
        people: {
          select: {
            person: {
              select: {
                name: true,
              },
            },
          },
        },
      },
      orderBy: [
        { bookMark: Prisma.SortOrder.desc },
        { createdAt: Prisma.SortOrder.desc },
      ],
    });

    return records.map((record) => ({
      id: record.id,
      type: record.type,
      title: this.piiCryptoService.decrypt(record.title),
      people: record.people.map(({ person }) =>
        this.piiCryptoService.decrypt(person.name),
      ),
      createdAt: record.createdAt.toISOString(),
      bookMark: record.bookMark,
      voiceDuration:
        record.type === RecordType.VOICE
          ? this.toMinuteSecond(record.voiceDurationSeconds)
          : null,
    }));
  }

  async createVoiceRecordFromStt(
    userId: string,
    file: VoiceRecordFile,
    recordMemo: string | null,
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
            content: this.piiCryptoService.encrypt(transcribedText),
            voiceFileId: voiceFile.id,
          },
        });

        if (recordMemo) {
          await tx.recordMemo.create({
            data: {
              userId,
              recordId: record.id,
              content: this.piiCryptoService.encrypt(recordMemo),
            },
          });
        }

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

  async createTextRecord(
    userId: string,
    item: CreateTextRecordDto,
  ): Promise<TextRecordCreateResponse> {
    await this.assertPeopleExist(userId, item.peopleIds);

    const createdRecord = await this.prisma.$transaction(async (tx) => {
      const record = await tx.record.create({
        data: {
          userId,
          type: RecordType.TEXT,
          title: this.piiCryptoService.encrypt(item.title),
          content: this.piiCryptoService.encrypt(item.content),
        },
        select: {
          id: true,
        },
      });

      if (item.peopleIds.length > 0) {
        await tx.recordPerson.createMany({
          data: item.peopleIds.map((personId) => ({
            userId,
            recordId: record.id,
            personId,
          })),
          skipDuplicates: true,
        });
      }

      return tx.record.findFirst({
        where: {
          id: record.id,
          userId,
          type: RecordType.TEXT,
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          content: true,
          bookMark: true,
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
          },
        },
      });
    });

    if (!createdRecord) {
      throw new NotFoundException({
        code: 'TEXT_RECORD_NOT_FOUND',
        message: '생성된 텍스트 기록을 찾을 수 없습니다.',
      });
    }

    return {
      recordId: createdRecord.id,
      title: this.piiCryptoService.decrypt(createdRecord.title),
      createdAt: createdRecord.createdAt.toISOString(),
      content: this.piiCryptoService.decrypt(createdRecord.content) ?? '',
      bookMark: createdRecord.bookMark,
      people: createdRecord.people.map(({ person }) => ({
        id: person.id,
        name: this.piiCryptoService.decrypt(person.name),
        image: this.toSignedMediaFileUrl(person.profileImageFile),
      })),
    };
  }

  async getTextRecord(
    userId: string,
    recordId: string,
  ): Promise<TextRecordDetailResponse> {
    const record = await this.prisma.record.findFirst({
      where: {
        id: recordId,
        userId,
        type: RecordType.TEXT,
      },
      select: {
        id: true,
        title: true,
        createdAt: true,
        content: true,
        bookMark: true,
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
        },
        schedule: {
          select: {
            id: true,
            title: true,
            scheduleTime: true,
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
            },
          },
        },
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'TEXT_RECORD_NOT_FOUND',
        message: '텍스트 기록을 찾을 수 없습니다.',
        recordId,
      });
    }

    return {
      recordId: record.id,
      title: this.piiCryptoService.decrypt(record.title),
      createdAt: record.createdAt.toISOString(),
      content: this.piiCryptoService.decrypt(record.content) ?? '',
      bookMark: record.bookMark,
      people: this.toTextRecordPeopleResponse(record.people),
      schedule: this.toVoiceRecordScheduleResponse(record.schedule, new Date()),
    };
  }

  async updateTextRecord(
    userId: string,
    recordId: string,
    item: UpdateTextRecordDto,
  ): Promise<TextRecordDetailResponse> {
    if (
      !this.hasOwn(item, 'title') &&
      !this.hasOwn(item, 'content') &&
      !this.hasOwn(item, 'personIds') &&
      !this.hasOwn(item, 'bookMark')
    ) {
      throw new BadRequestException({
        code: 'TEXT_RECORD_UPDATE_EMPTY',
        message: '수정할 필드를 하나 이상 입력해 주세요.',
      });
    }

    await this.findTextRecordForUpdateOrThrow(userId, recordId);

    if (this.hasOwn(item, 'personIds')) {
      await this.assertPeopleExist(userId, item.personIds ?? []);
    }

    const updatedRecord = await this.prisma.$transaction(async (tx) => {
      const recordUpdateData: Prisma.RecordUpdateInput = {
        updatedAt: new Date(),
      };

      if (this.hasOwn(item, 'title')) {
        recordUpdateData.title = this.piiCryptoService.encrypt(
          item.title as string,
        );
      }

      if (this.hasOwn(item, 'content')) {
        recordUpdateData.content = this.piiCryptoService.encrypt(item.content);
      }

      if (this.hasOwn(item, 'bookMark')) {
        recordUpdateData.bookMark = item.bookMark;
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
          type: RecordType.TEXT,
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          content: true,
          bookMark: true,
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
          },
          schedule: {
            select: {
              id: true,
              title: true,
              scheduleTime: true,
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
              },
            },
          },
        },
      });
    });

    if (!updatedRecord) {
      throw new NotFoundException({
        code: 'TEXT_RECORD_NOT_FOUND',
        message: '수정할 텍스트 기록을 찾을 수 없습니다.',
        recordId,
      });
    }

    return {
      recordId: updatedRecord.id,
      title: this.piiCryptoService.decrypt(updatedRecord.title),
      createdAt: updatedRecord.createdAt.toISOString(),
      content: this.piiCryptoService.decrypt(updatedRecord.content) ?? '',
      bookMark: updatedRecord.bookMark,
      people: this.toTextRecordPeopleResponse(updatedRecord.people),
      schedule: this.toVoiceRecordScheduleResponse(
        updatedRecord.schedule,
        new Date(),
      ),
    };
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
        bookMark: true,
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
        schedule: {
          select: {
            id: true,
            title: true,
            scheduleTime: true,
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
            },
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
      title: this.piiCryptoService.decrypt(record.title),
      createdAt: record.createdAt.toISOString(),
      recordPeople: this.toVoiceRecordDetailPeopleResponse(record.people),
      recordKeywords: record.keywords.map((keyword) => keyword.name),
      content: this.piiCryptoService.decrypt(record.content) ?? '',
      bookMark: record.bookMark,
      recordMemo: this.piiCryptoService.decrypt(record.recordMemo?.content),
      voiceFileUrl: this.toSignedMediaFileUrl(record.voiceFile),
      schedule: this.toVoiceRecordScheduleResponse(record.schedule, new Date()),
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

    const content = this.piiCryptoService.decrypt(record.content)?.trim();

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
          content: this.piiCryptoService.encrypt(summaryResult.summary),
        },
        select: {
          id: true,
          title: true,
          createdAt: true,
          content: true,
          bookMark: true,
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
          schedule: {
            select: {
              id: true,
              title: true,
              scheduleTime: true,
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
              },
            },
          },
        },
      });
    });

    return {
      recordId: updatedRecord.id,
      title: this.piiCryptoService.decrypt(updatedRecord.title),
      createdAt: updatedRecord.createdAt.toISOString(),
      keyword: updatedRecord.keywords.map((keyword) => keyword.name),
      content: this.piiCryptoService.decrypt(updatedRecord.content) ?? '',
      bookMark: updatedRecord.bookMark,
      voiceFileUrl: this.toSignedMediaFileUrl(updatedRecord.voiceFile),
      recordMemo: this.piiCryptoService.decrypt(
        updatedRecord.recordMemo?.content,
      ),
      schedule: this.toVoiceRecordScheduleResponse(
        updatedRecord.schedule,
        new Date(),
      ),
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
      !this.hasOwn(item, 'personIds') &&
      !this.hasOwn(item, 'bookMark')
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
        recordUpdateData.title = this.piiCryptoService.encrypt(
          item.title as string,
        );
      }

      if (this.hasOwn(item, 'bookMark')) {
        recordUpdateData.bookMark = item.bookMark;
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
              content: this.piiCryptoService.encrypt(recordMemo),
            },
            update: {
              content: this.piiCryptoService.encrypt(recordMemo),
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
          bookMark: true,
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
          },
          schedule: {
            select: {
              id: true,
              title: true,
              scheduleTime: true,
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
      title: this.piiCryptoService.decrypt(updatedRecord.title),
      createdAt: updatedRecord.createdAt.toISOString(),
      recordPeople: this.toVoiceRecordDetailPeopleResponse(
        updatedRecord.people,
      ),
      recordKeywords: updatedRecord.keywords.map((keyword) => keyword.name),
      content: this.piiCryptoService.decrypt(updatedRecord.content) ?? '',
      bookMark: updatedRecord.bookMark,
      recordMemo: this.piiCryptoService.decrypt(
        updatedRecord.recordMemo?.content,
      ),
      voiceFileUrl: this.toSignedMediaFileUrl(updatedRecord.voiceFile),
      schedule: this.toVoiceRecordScheduleResponse(
        updatedRecord.schedule,
        new Date(),
      ),
    };
  }

  async deleteRecord(
    userId: string,
    recordId: string,
  ): Promise<DeleteRecordResult> {
    let s3KeysToDelete: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const record = await tx.record.findFirst({
        where: {
          id: recordId,
          userId,
        },
        select: {
          id: true,
          type: true,
          voiceFile: {
            select: {
              id: true,
              s3Key: true,
            },
          },
        },
      });

      if (!record) {
        throw new NotFoundException({
          code: 'RECORD_NOT_FOUND',
          message: '기록을 찾을 수 없습니다.',
          recordId,
        });
      }

      if (record.type === RecordType.VOICE && record.voiceFile) {
        s3KeysToDelete = [record.voiceFile.s3Key];

        await tx.mediaFile.deleteMany({
          where: {
            id: record.voiceFile.id,
            userId,
          },
        });
      }

      await tx.record.deleteMany({
        where: {
          id: record.id,
          userId,
        },
      });
    });

    if (s3KeysToDelete.length > 0) {
      await this.s3Service.deleteFiles(s3KeysToDelete);
    }

    return {
      success: true,
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

  private toTextRecordPeopleResponse(
    people: {
      person: {
        id: string;
        name: string;
        profileImageFile: { s3Key: string } | null;
      };
    }[],
  ): TextRecordPersonResponse[] {
    return people.map(({ person }) => ({
      id: person.id,
      name: this.piiCryptoService.decrypt(person.name),
      image: this.toSignedMediaFileUrl(person.profileImageFile),
    }));
  }

  private toVoiceRecordDetailPeopleResponse(
    people: {
      person: {
        id: string;
        name: string;
        profileImageFile: { s3Key: string } | null;
      };
    }[],
  ): VoiceRecordDetailPersonResponse[] {
    return people.map(({ person }) => ({
      id: person.id,
      name: this.piiCryptoService.decrypt(person.name),
      image: this.toSignedMediaFileUrl(person.profileImageFile),
    }));
  }

  private toVoiceRecordPeopleResponse(
    people: {
      person: {
        id: string;
        name: string;
      };
    }[],
  ): VoiceRecordPersonResponse[] {
    return people.map(({ person }) => ({
      id: person.id,
      name: this.piiCryptoService.decrypt(person.name),
    }));
  }

  private toVoiceRecordScheduleResponse(
    schedule: VoiceRecordScheduleData | null | undefined,
    now: Date,
  ): VoiceRecordScheduleResponse | null {
    if (!schedule) {
      return null;
    }

    return {
      scheduleId: schedule.id,
      title: this.piiCryptoService.decrypt(schedule.title),
      scheduleTime: schedule.scheduleTime.toISOString(),
      dDay: this.toDDay(now, schedule.scheduleTime),
      people: schedule.people.map(({ person }) => ({
        id: person.id,
        name: this.piiCryptoService.decrypt(person.name),
        image: this.toSignedMediaFileUrl(person.profileImageFile),
      })),
    };
  }

  private toDDay(now: Date, scheduleTime: Date): string {
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const scheduleDate = new Date(
      scheduleTime.getFullYear(),
      scheduleTime.getMonth(),
      scheduleTime.getDate(),
    );
    const daysLeft = Math.max(
      0,
      Math.floor(
        (scheduleDate.getTime() - nowDate.getTime()) / MILLISECONDS_PER_DAY,
      ),
    );

    return `D-${daysLeft}`;
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

  private async findTextRecordForUpdateOrThrow(
    userId: string,
    recordId: string,
  ): Promise<void> {
    const record = await this.prisma.record.findFirst({
      where: {
        id: recordId,
        userId,
        type: RecordType.TEXT,
      },
      select: {
        id: true,
      },
    });

    if (!record) {
      throw new NotFoundException({
        code: 'TEXT_RECORD_NOT_FOUND',
        message: '수정할 텍스트 기록을 찾을 수 없습니다.',
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
    return Object.hasOwn(object, key);
  }

  private async deleteUploadedFiles(keys: string[]): Promise<void> {
    if (keys.length === 0) {
      return;
    }

    await this.s3Service.deleteFiles(keys).catch(() => undefined);
  }
}
