import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MediaFileType,
  MediaFileUsage,
  Prisma,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service, type UploadedS3File } from '../s3/s3.service';
import type {
  CreateExtraContactDto,
  CreatePersonItemDto,
} from './dto/create-person-item.dto';
import type { ImportPersonItemDto } from './dto/import-people.dto';
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

export interface PersonListItemResponse {
  id: string;
  name: string;
  phoneNumber: string;
  image: string | null;
  isImportant: boolean;
  updatedAt: string;
}

export interface ImportedPersonListItemResponse {
  id: string;
  name: string;
  phoneNumber: string;
  image: string | null;
  isImportant: boolean;
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

export interface CreatedPersonResponse {
  id: string;
  name: string;
  image: string | null;
  birthDate: string | null;
  isImportant: boolean;
  phoneNumber: string;
  job: string | null;
  company: string | null;
  position: string | null;
  relationship: string | null;
  personality: string | null;
  birthdayNotificationEnabled: boolean;
  birthdayNotificationOffsetDays: number | null;
  extraContacts: {
    id: string;
    type: string;
    content: string;
  }[];
  businessCards: {
    id: string;
    frontImageFile: {
      id: string;
      url: string;
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
      url: string;
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

export type PersonDetailResponse = CreatedPersonResponse;

interface PersonProfileImageFile {
  s3Key: string;
}

interface UploadedPersonStorageFile extends UploadedS3File {
  originalName?: string;
}

interface UploadedPersonFiles {
  image?: UploadedPersonStorageFile;
  businessCardFrontImage?: UploadedPersonStorageFile;
  businessCardBackImage?: UploadedPersonStorageFile;
}

type BusinessCardWithMediaFiles = {
  id: string;
  frontImageFile: MediaFileResponseSource | null;
  backImageFile: MediaFileResponseSource | null;
};

type MediaFileResponseSource = {
  id: string;
  type: MediaFileType;
  usage: MediaFileUsage;
  bucket: string;
  s3Key: string;
  contentType: string;
  sizeBytes: number;
  originalName: string | null;
};

type PersonDetailQueryResult = {
  id: string;
  name: string;
  birthDate: Date | null;
  isImportant: boolean;
  phoneNumber: string;
  job: string | null;
  company: string | null;
  position: string | null;
  relationship: string | null;
  personality: string | null;
  birthdayNotificationEnabled: boolean;
  birthdayNotificationOffsetDays: number | null;
  profileImageFile: PersonProfileImageFile | null;
  extraContacts: {
    id: string;
    type: string;
    content: string;
  }[];
  businessCards: BusinessCardWithMediaFiles[];
};

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
  ) {}

  async createPerson(
    userId: string,
    item: CreatePersonItemDto,
    files: PersonCreateFiles,
  ): Promise<CreatedPersonResponse> {
    await this.assertPhoneNumberIsAvailable(userId, item.phoneNumber);

    const uploadedFileKeys: string[] = [];

    try {
      // S3는 DB transaction에 포함되지 않으므로 먼저 업로드하고 key를 기록한다.
      // 이후 DB 단계가 실패하면 catch에서 업로드된 object를 best-effort로 삭제한다.
      const uploadedFiles = await this.uploadPersonFiles(
        userId,
        files,
        uploadedFileKeys,
      );

      return await this.prisma.$transaction(async (tx) => {
        // Person 도메인 값은 그대로 저장하되, 자동완성용 카테고리 테이블에도
        // 유저별 중복 없이 이름을 추가한다.
        await this.createMissingCategoryNames(tx, userId, [item]);

        const profileImageFile = uploadedFiles.image
          ? await tx.mediaFile.create({
              data: this.toMediaFileCreateData(
                userId,
                uploadedFiles.image,
                MediaFileUsage.PERSON_PROFILE,
              ),
            })
          : null;
        const createdPerson = await tx.person.create({
          data: {
            userId,
            name: item.name,
            profileImageFileId: profileImageFile?.id,
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
            birthdayNotificationOffsetDays:
              item.birthdayNotificationEnabled === true
                ? item.birthdayNotificationOffsetDays
                : null,
          },
        });
        const extraContacts = await this.createExtraContacts(
          tx,
          userId,
          createdPerson.id,
          item.extraContacts,
        );
        // 명함 앞/뒤 이미지 중 하나라도 있을 때만 BusinessCard를 만든다.
        const businessCard =
          uploadedFiles.businessCardFrontImage ||
          uploadedFiles.businessCardBackImage
            ? await this.createBusinessCard(
                tx,
                userId,
                createdPerson.id,
                uploadedFiles,
              )
            : null;

        return {
          ...createdPerson,
          birthDate: this.toDateOnlyString(createdPerson.birthDate),
          image: this.toSignedImageUrl(profileImageFile),
          extraContacts,
          businessCards: businessCard
            ? [this.toBusinessCardResponse(businessCard)]
            : [],
        };
      });
    } catch (error) {
      // DB rollback은 Prisma가 처리하지만 S3 업로드는 외부 부수효과라 직접 보상한다.
      await this.deleteUploadedFiles(uploadedFileKeys);
      throw error;
    }
  }

  async importPeople(
    userId: string,
    items: ImportPersonItemDto[],
  ): Promise<ImportedPersonListItemResponse[]> {
    const people = await this.prisma.person.createManyAndReturn({
      data: items.map((item) => ({
        userId,
        name: item.name,
        phoneNumber: item.phoneNumber,
      })),
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        isImportant: true,
      },
    });

    return people.map((person) => ({
      ...person,
      image: null,
    }));
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

  async getPeople(userId: string): Promise<PersonListItemResponse[]> {
    const people = await this.prisma.person.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        isImportant: true,
        updatedAt: true,
        profileImageFile: {
          select: {
            s3Key: true,
          },
        },
      },
      orderBy: { createdAt: Prisma.SortOrder.desc },
    });

    return people.map(({ profileImageFile, ...person }) => ({
      ...person,
      image: this.toSignedImageUrl(profileImageFile),
      updatedAt: person.updatedAt.toISOString(),
    }));
  }

  async getPerson(
    userId: string,
    personId: string,
  ): Promise<PersonDetailResponse> {
    const person = await this.prisma.person.findFirst({
      where: {
        id: personId,
        userId,
      },
      select: {
        id: true,
        name: true,
        birthDate: true,
        isImportant: true,
        phoneNumber: true,
        job: true,
        company: true,
        position: true,
        relationship: true,
        personality: true,
        birthdayNotificationEnabled: true,
        birthdayNotificationOffsetDays: true,
        profileImageFile: {
          select: {
            s3Key: true,
          },
        },
        extraContacts: {
          select: {
            id: true,
            type: true,
            content: true,
          },
          orderBy: { createdAt: Prisma.SortOrder.asc },
        },
        businessCards: {
          select: {
            id: true,
            frontImageFile: {
              select: {
                id: true,
                type: true,
                usage: true,
                bucket: true,
                s3Key: true,
                contentType: true,
                sizeBytes: true,
                originalName: true,
              },
            },
            backImageFile: {
              select: {
                id: true,
                type: true,
                usage: true,
                bucket: true,
                s3Key: true,
                contentType: true,
                sizeBytes: true,
                originalName: true,
              },
            },
          },
          orderBy: { createdAt: Prisma.SortOrder.asc },
        },
      },
    });

    if (!person) {
      throw new NotFoundException({
        code: 'PERSON_NOT_FOUND',
        message: '인물을 찾을 수 없습니다.',
        personId,
      });
    }

    return this.toPersonDetailResponse(person);
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

  private async assertPhoneNumberIsAvailable(
    userId: string,
    phoneNumber: string,
  ): Promise<void> {
    const existingPerson = await this.prisma.person.findFirst({
      where: {
        userId,
        phoneNumber,
      },
      select: {
        id: true,
      },
    });

    if (!existingPerson) {
      return;
    }

    throw new ConflictException({
      code: 'PERSON_PHONE_NUMBER_ALREADY_EXISTS',
      message: '이미 등록된 전화번호입니다.',
      phoneNumber,
    });
  }

  private async uploadPersonFiles(
    userId: string,
    files: PersonCreateFiles,
    uploadedFileKeys: string[],
  ): Promise<UploadedPersonFiles> {
    const uploadedFiles: UploadedPersonFiles = {};

    if (files.image) {
      uploadedFiles.image = await this.uploadPersonFile(
        files.image,
        `people/${userId}/profiles`,
        uploadedFileKeys,
      );
    }

    if (files.businessCardFrontImage) {
      uploadedFiles.businessCardFrontImage = await this.uploadPersonFile(
        files.businessCardFrontImage,
        `people/${userId}/business-cards/front`,
        uploadedFileKeys,
      );
    }

    if (files.businessCardBackImage) {
      uploadedFiles.businessCardBackImage = await this.uploadPersonFile(
        files.businessCardBackImage,
        `people/${userId}/business-cards/back`,
        uploadedFileKeys,
      );
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

  private async createExtraContacts(
    tx: Prisma.TransactionClient,
    userId: string,
    personId: string,
    extraContacts: CreateExtraContactDto[] | undefined,
  ) {
    if (!extraContacts || extraContacts.length === 0) {
      return [];
    }

    return Promise.all(
      extraContacts.map((extraContact) =>
        tx.extraContact.create({
          data: {
            userId,
            personId,
            type: extraContact.type,
            content: extraContact.content,
          },
          select: {
            id: true,
            type: true,
            content: true,
          },
        }),
      ),
    );
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

  private toSignedImageUrl(
    imageFile: PersonProfileImageFile | null | undefined,
  ): string | null {
    return imageFile ? this.s3Service.getSignedUrl(imageFile.s3Key) : null;
  }

  private toBusinessCardResponse(businessCard: BusinessCardWithMediaFiles) {
    return {
      id: businessCard.id,
      frontImageFile: this.toMediaFileResponse(businessCard.frontImageFile),
      backImageFile: this.toMediaFileResponse(businessCard.backImageFile),
    };
  }

  private toPersonDetailResponse(
    person: PersonDetailQueryResult,
  ): PersonDetailResponse {
    const { profileImageFile, businessCards, ...personFields } = person;

    return {
      ...personFields,
      birthDate: this.toDateOnlyString(person.birthDate),
      image: this.toSignedImageUrl(profileImageFile),
      businessCards: businessCards.map((businessCard) =>
        this.toBusinessCardResponse(businessCard),
      ),
    };
  }

  private toMediaFileResponse(file: MediaFileResponseSource | null) {
    return file
      ? {
          id: file.id,
          url: this.s3Service.getSignedUrl(file.s3Key),
          type: file.type,
          usage: file.usage,
          bucket: file.bucket,
          s3Key: file.s3Key,
          contentType: file.contentType,
          sizeBytes: file.sizeBytes,
          originalName: file.originalName,
        }
      : null;
  }

  private toDateOnlyString(date: Date | null): string | null {
    return date ? date.toISOString().slice(0, 10) : null;
  }

  private toDate(date?: string): Date | undefined {
    return date ? new Date(date) : undefined;
  }

  private async deleteUploadedFiles(keys: string[]): Promise<void> {
    // cleanup 실패가 원래 오류를 덮지 않도록 allSettled를 사용한다.
    await Promise.allSettled(keys.map((key) => this.s3Service.deleteFile(key)));
  }
}
