import { Injectable } from '@nestjs/common';
import {
  MediaFileType,
  MediaFileUsage,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service, type UploadedS3File } from '../s3/s3.service';
import type { CreatePersonItemDto } from './dto/create-person-item.dto';
import {
  DEFAULT_JOB_NAMES,
  DEFAULT_POSITION_NAMES,
  DEFAULT_RELATIONSHIP_NAMES,
} from './people.constants';

export interface PersonCategoryNamesResponse {
  jobs: string[];
  companies: string[];
  positions: string[];
  relationships: string[];
}

export interface PersonImageFile {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
  size: number;
}

export interface PersonCreateFiles {
  image?: PersonImageFile;
  businessCardFrontImage?: PersonImageFile;
  businessCardBackImage?: PersonImageFile;
}

export type PersonCreateFilesByIndex = Map<number, PersonCreateFiles>;

export interface CreatedPersonResponse {
  id: string;
  name: string;
  image: string | null;
  birthDate: Date | null;
  isImportant: boolean;
  phoneNumber: string | null;
  job: string | null;
  company: string | null;
  position: string | null;
  relationship: string | null;
  personality: string | null;
  birthdayNotificationEnabled: boolean;
  scheduleNotificationEnabled: boolean;
  businessCards: {
    id: string;
    frontImageFile: {
      id: string;
      type: MediaFileType;
      usage: MediaFileUsage;
      bucket: string;
      s3Key: string;
      contentType: string;
      sizeBytes: number;
      originalName: string | null;
    } | null;
    backImageFile: {
      id: string;
      type: MediaFileType;
      usage: MediaFileUsage;
      bucket: string;
      s3Key: string;
      contentType: string;
      sizeBytes: number;
      originalName: string | null;
    } | null;
  }[];
}

interface UploadedPersonStorageFile extends UploadedS3File {
  originalName?: string;
}

interface UploadedPersonFiles {
  image?: UploadedPersonStorageFile;
  businessCardFrontImage?: UploadedPersonStorageFile;
  businessCardBackImage?: UploadedPersonStorageFile;
}

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  async createPeople(
    userId: string,
    items: CreatePersonItemDto[],
    filesByIndex: PersonCreateFilesByIndex,
  ): Promise<CreatedPersonResponse[]> {
    const uploadedFileKeys: string[] = [];

    try {
      // S3는 DB transaction에 포함되지 않으므로 먼저 업로드하고 key를 기록한다.
      // 이후 DB 단계가 실패하면 catch에서 업로드된 object를 best-effort로 삭제한다.
      const uploadedFiles = await this.uploadPeopleFiles(
        userId,
        items,
        filesByIndex,
        uploadedFileKeys,
      );

      return await this.prisma.$transaction(async (tx) => {
        // Person에는 문자열 값을 그대로 저장하되, 자동완성용 카테고리 테이블에도
        // 유저별 중복 없이 이름을 추가한다.
        await this.createMissingCategoryNames(tx, userId, items);

        const createdPeople: CreatedPersonResponse[] = [];

        for (const [index, item] of items.entries()) {
          const createdPerson = await tx.person.create({
            data: {
              userId,
              name: item.name,
              image: uploadedFiles[index]?.image?.url,
              birthDate: this.toDate(item.birthDate),
              isImportant: item.isImportant ?? false,
              phoneNumber: item.phoneNumber,
              job: item.job,
              company: item.company,
              position: item.position,
              relationship: item.relationship,
              personality: item.personality,
              birthdayNotificationEnabled:
                item.birthdayNotificationEnabled ?? false,
              scheduleNotificationEnabled:
                item.scheduleNotificationEnabled ?? false,
            },
          });
          const uploadedBusinessCardFiles = uploadedFiles[index];
          // 명함 앞/뒤 이미지 중 하나라도 있을 때만 BusinessCard를 만든다.
          const businessCard =
            uploadedBusinessCardFiles?.businessCardFrontImage ||
            uploadedBusinessCardFiles?.businessCardBackImage
              ? await this.createBusinessCard(
                  tx,
                  userId,
                  createdPerson.id,
                  uploadedBusinessCardFiles,
                )
              : null;

          createdPeople.push({
            ...createdPerson,
            businessCards: businessCard ? [businessCard] : [],
          });
        }

        return createdPeople;
      });
    } catch (error) {
      // DB rollback은 Prisma가 처리하지만 S3 업로드는 외부 부수효과라 직접 보상한다.
      await this.deleteUploadedFiles(uploadedFileKeys);
      throw error;
    }
  }

  async getCategoryNames(userId: string): Promise<PersonCategoryNamesResponse> {
    await this.ensureDefaultCategories(userId);

    const [jobs, companies, positions, relationships] = await Promise.all([
      this.prisma.job.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: Prisma.SortOrder.asc },
      }),
      this.prisma.company.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: Prisma.SortOrder.asc },
      }),
      this.prisma.position.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: Prisma.SortOrder.asc },
      }),
      this.prisma.relationship.findMany({
        where: { userId },
        select: { name: true },
        orderBy: { name: Prisma.SortOrder.asc },
      }),
    ]);

    return {
      jobs: jobs.map(({ name }) => name),
      companies: companies.map(({ name }) => name),
      positions: positions.map(({ name }) => name),
      relationships: relationships.map(({ name }) => name),
    };
  }

  private async ensureDefaultCategories(userId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.job.createMany({
        data: DEFAULT_JOB_NAMES.map((name) => ({ userId, name })),
        skipDuplicates: true,
      }),
      this.prisma.position.createMany({
        data: DEFAULT_POSITION_NAMES.map((name) => ({ userId, name })),
        skipDuplicates: true,
      }),
      this.prisma.relationship.createMany({
        data: DEFAULT_RELATIONSHIP_NAMES.map((name) => ({ userId, name })),
        skipDuplicates: true,
      }),
    ]);
  }

  private async uploadPeopleFiles(
    userId: string,
    items: CreatePersonItemDto[],
    filesByIndex: PersonCreateFilesByIndex,
    uploadedFileKeys: string[],
  ): Promise<UploadedPersonFiles[]> {
    const uploadedFiles: UploadedPersonFiles[] = Array.from(
      { length: items.length },
      () => ({}),
    );

    // filesByIndex에는 파일을 가진 사람만 들어온다. 파일이 없는 사람은 빈 객체로 유지해
    // items 배열의 index와 uploadedFiles 배열의 index를 계속 맞춘다.
    for (const [index, files] of filesByIndex.entries()) {
      if (files.image) {
        uploadedFiles[index].image = await this.uploadPersonFile(
          files.image,
          `people/${userId}/profiles`,
          uploadedFileKeys,
        );
      }

      if (files.businessCardFrontImage) {
        uploadedFiles[index].businessCardFrontImage =
          await this.uploadPersonFile(
            files.businessCardFrontImage,
            `people/${userId}/business-cards/front`,
            uploadedFileKeys,
          );
      }

      if (files.businessCardBackImage) {
        uploadedFiles[index].businessCardBackImage =
          await this.uploadPersonFile(
            files.businessCardBackImage,
            `people/${userId}/business-cards/back`,
            uploadedFileKeys,
          );
      }
    }

    return uploadedFiles;
  }

  private async uploadPersonFile(
    file: PersonImageFile,
    prefix: string,
    uploadedFileKeys: string[],
  ): Promise<UploadedPersonStorageFile> {
    const uploadedFile = await this.s3Service.uploadFile({
      body: file.buffer,
      contentType: file.mimetype,
      originalName: file.originalname,
      prefix,
    });
    uploadedFileKeys.push(uploadedFile.key);

    return {
      ...uploadedFile,
      originalName: file.originalname,
    };
  }

  private async createMissingCategoryNames(
    tx: Prisma.TransactionClient,
    userId: string,
    items: CreatePersonItemDto[],
  ): Promise<void> {
    const jobs = this.toCategoryCreateManyData(
      userId,
      items.map(({ job }) => job),
    );
    const companies = this.toCategoryCreateManyData(
      userId,
      items.map(({ company }) => company),
    );
    const positions = this.toCategoryCreateManyData(
      userId,
      items.map(({ position }) => position),
    );
    const relationships = this.toCategoryCreateManyData(
      userId,
      items.map(({ relationship }) => relationship),
    );

    await Promise.all([
      // createMany에 빈 배열을 넘기지 않도록 값이 있을 때만 호출한다.
      jobs.length > 0
        ? tx.job.createMany({ data: jobs, skipDuplicates: true })
        : Promise.resolve(),
      companies.length > 0
        ? tx.company.createMany({ data: companies, skipDuplicates: true })
        : Promise.resolve(),
      positions.length > 0
        ? tx.position.createMany({ data: positions, skipDuplicates: true })
        : Promise.resolve(),
      relationships.length > 0
        ? tx.relationship.createMany({
            data: relationships,
            skipDuplicates: true,
          })
        : Promise.resolve(),
    ]);
  }

  private async createBusinessCard(
    tx: Prisma.TransactionClient,
    userId: string,
    personId: string,
    uploadedFiles: UploadedPersonFiles,
  ) {
    const frontImageFileId = uploadedFiles.businessCardFrontImage
      ? (
          await tx.mediaFile.create({
            data: this.toMediaFileCreateData(
              userId,
              uploadedFiles.businessCardFrontImage,
              MediaFileUsage.BUSINESS_CARD_FRONT,
            ),
          })
        ).id
      : null;
    const backImageFileId = uploadedFiles.businessCardBackImage
      ? (
          await tx.mediaFile.create({
            data: this.toMediaFileCreateData(
              userId,
              uploadedFiles.businessCardBackImage,
              MediaFileUsage.BUSINESS_CARD_BACK,
            ),
          })
        ).id
      : null;

    return tx.businessCard.create({
      data: {
        userId,
        personId,
        frontImageFileId,
        backImageFileId,
      },
      include: {
        frontImageFile: true,
        backImageFile: true,
      },
    });
  }

  private toCategoryCreateManyData(
    userId: string,
    names: (string | undefined)[],
  ) {
    // 같은 요청 안에서 동일 카테고리명이 여러 번 들어와도 DB에는 한 번만 요청한다.
    const uniqueNames = [
      ...new Set(names.filter((name): name is string => !!name)),
    ];

    return uniqueNames.map((name) => ({ userId, name }));
  }

  private toMediaFileCreateData(
    userId: string,
    file: UploadedPersonStorageFile,
    usage: MediaFileUsage,
  ) {
    return {
      userId,
      type: MediaFileType.IMAGE,
      usage,
      bucket: file.bucket,
      s3Key: file.key,
      contentType: file.contentType,
      sizeBytes: file.size,
      originalName: file.originalName,
    };
  }

  private toDate(date?: string): Date | undefined {
    return date ? new Date(date) : undefined;
  }

  private async deleteUploadedFiles(keys: string[]): Promise<void> {
    // cleanup 실패가 원래 오류를 덮지 않도록 allSettled를 사용한다.
    await Promise.allSettled(keys.map((key) => this.s3Service.deleteFile(key)));
  }
}
