import {
  ConflictException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import {
  MediaFileType,
  MediaFileUsage,
  NotificationStatus,
  NotificationType,
  Prisma,
  RecordType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PiiCryptoService } from '../privacy/pii-crypto.service';
import { S3Service, type UploadedS3File } from '../s3/s3.service';
import type {
  HomeRecordResponse,
  HomeScheduleResponse,
} from '../home/home.service';
import type {
  CreateExtraContactDto,
  CreatePersonItemDto,
} from './dto/create-person-item.dto';
import type { ImportPersonItemDto } from './dto/import-people.dto';
import type { UpdatePersonItemDto } from './dto/update-person-item.dto';
import {
  DEFAULT_JOB_NAMES,
  DEFAULT_POSITION_NAMES,
  DEFAULT_RELATIONSHIP_NAMES,
} from './people.constants';

const PERSON_UPCOMING_SCHEDULE_LIMIT = 5;
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;
const DEFAULT_BIRTHDAY_NOTIFICATION_OFFSET_MINUTES = 24 * 60;
const BIRTHDAY_NOTIFICATION_HOUR_KST = 9;
const KST_OFFSET_HOURS = 9;

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
  job: string | null;
  company: string | null;
  position: string | null;
  relationship: string | null;
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
  birthdayNotificationOffsetMinutes: number;
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
    } | null;
    backImageFile: {
      id: string;
      url: string;
    } | null;
  }[];
}

export interface PersonDetailResponse extends CreatedPersonResponse {
  upcomingSchedules: HomeScheduleResponse[];
  records: HomeRecordResponse[];
}

export interface DeletePersonResult {
  success: true;
}

interface PersonProfileImageFile {
  s3Key: string;
}

interface MediaFileForDeletion {
  id: string;
  s3Key: string;
}

interface ExistingPersonProfileImageFile extends PersonProfileImageFile {
  id: string;
}

type ExistingPersonForProfileImage = {
  id: string;
  profileImageFile: ExistingPersonProfileImageFile | null;
};

interface UploadedPersonStorageFile extends UploadedS3File {
  originalName?: string;
}

interface UploadedPersonFiles {
  image?: UploadedPersonStorageFile;
  businessCardFrontImage?: UploadedPersonStorageFile;
  businessCardBackImage?: UploadedPersonStorageFile;
}

interface PersonCategoryNameSource {
  job?: string | null;
  company?: string | null;
  position?: string | null;
  relationship?: string | null;
}

type BusinessCardWithMediaFiles = {
  id: string;
  frontImageFile: MediaFileResponseSource | null;
  backImageFile: MediaFileResponseSource | null;
};

type MediaFileResponseSource = {
  id: string;
  s3Key: string;
};

type PersonDetailQueryResult = {
  id: string;
  name: string;
  birthDate: string | null;
  birthMonth: number | null;
  birthDay: number | null;
  isImportant: boolean;
  phoneNumber: string;
  job: string | null;
  company: string | null;
  position: string | null;
  relationship: string | null;
  personality: string | null;
  birthdayNotificationEnabled: boolean;
  birthdayNotificationOffsetMinutes: number;
  profileImageFile: PersonProfileImageFile | null;
  extraContacts: {
    id: string;
    type: string;
    content: string;
  }[];
  businessCards: BusinessCardWithMediaFiles[];
};

type PersonDetailClient = Pick<
  Prisma.TransactionClient,
  'person' | 'schedule' | 'record'
>;

type BirthdayNotificationJobClient = Pick<
  Prisma.TransactionClient,
  'notificationJob'
>;

type ExistingPersonForUpdate = {
  id: string;
  phoneNumber: string;
  phoneNumberHash: string | null;
  birthdayNotificationEnabled: boolean;
  birthdayNotificationOffsetMinutes: number;
};

type PersonForDeletion = {
  id: string;
  profileImageFile: MediaFileForDeletion | null;
  businessCards: {
    frontImageFile: MediaFileForDeletion | null;
    backImageFile: MediaFileForDeletion | null;
  }[];
  records: {
    recordId: string;
    record: {
      id: string;
      voiceFile: MediaFileForDeletion | null;
      _count: {
        people: number;
      };
    };
  }[];
};

interface PersonDeletionPlan {
  mediaFileIds: string[];
  s3Keys: string[];
  orphanRecordIds: string[];
  sharedRecordIds: string[];
}

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly s3Service: S3Service,
    @Optional()
    private readonly piiCryptoService: PiiCryptoService = new PiiCryptoService(),
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
            name: this.piiCryptoService.encrypt(item.name),
            profileImageFileId: profileImageFile?.id,
            birthDate: this.encryptNullable(item.birthDate),
            ...this.toBirthDatePartData(item.birthDate),
            isImportant: item.isImportant ?? false,
            phoneNumber: this.piiCryptoService.encrypt(item.phoneNumber),
            phoneNumberHash: this.hashPhoneNumber(item.phoneNumber),
            job: item.job,
            company: item.company,
            position: item.position,
            relationship: item.relationship,
            personality: item.personality,
            birthdayNotificationEnabled:
              item.birthdayNotificationEnabled ?? false,
            birthdayNotificationOffsetMinutes:
              item.birthdayNotificationOffsetMinutes ??
              DEFAULT_BIRTHDAY_NOTIFICATION_OFFSET_MINUTES,
          },
        });
        await this.syncBirthdayNotificationJob(tx, userId, createdPerson);
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

        const {
          phoneNumberHash,
          birthMonth,
          birthDay,
          ...createdPersonFields
        } = createdPerson;

        return {
          ...createdPersonFields,
          name: this.piiCryptoService.decrypt(createdPerson.name),
          birthDate: this.toDateOnlyString(createdPerson.birthDate),
          phoneNumber: this.piiCryptoService.decrypt(createdPerson.phoneNumber),
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
        name: this.piiCryptoService.encrypt(item.name),
        phoneNumber: this.piiCryptoService.encrypt(item.phoneNumber),
        phoneNumberHash: this.hashPhoneNumber(item.phoneNumber),
      })),
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        isImportant: true,
      },
    });

    return people.map((person) => ({
      id: person.id,
      name: this.piiCryptoService.decrypt(person.name),
      phoneNumber: this.piiCryptoService.decrypt(person.phoneNumber),
      isImportant: person.isImportant,
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
        job: true,
        company: true,
        position: true,
        relationship: true,
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
      name: this.piiCryptoService.decrypt(person.name),
      phoneNumber: this.piiCryptoService.decrypt(person.phoneNumber),
      image: this.toSignedImageUrl(profileImageFile),
      updatedAt: person.updatedAt.toISOString(),
    }));
  }

  async getPerson(
    userId: string,
    personId: string,
  ): Promise<PersonDetailResponse> {
    return this.findPersonDetailOrThrow(this.prisma, userId, personId);
  }

  async updatePerson(
    userId: string,
    personId: string,
    item: UpdatePersonItemDto,
  ): Promise<PersonDetailResponse> {
    const existingPerson = await this.findExistingPersonForUpdate(
      userId,
      personId,
    );

    if (
      item.phoneNumber !== undefined &&
      this.hashPhoneNumber(item.phoneNumber) !== existingPerson.phoneNumberHash
    ) {
      await this.assertPhoneNumberIsAvailable(
        userId,
        item.phoneNumber,
        personId,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await this.createMissingCategoryNames(tx, userId, [item]);

      await tx.person.update({
        where: {
          id_userId: {
            id: personId,
            userId,
          },
        },
        data: this.toPersonUpdateData(item),
      });

      if (this.hasOwn(item, 'extraContacts')) {
        await tx.extraContact.deleteMany({
          where: {
            userId,
            personId,
          },
        });
        await this.createExtraContacts(
          tx,
          userId,
          personId,
          item.extraContacts,
        );
      }

      const updatedPerson = await tx.person.findFirst({
        where: {
          id: personId,
          userId,
        },
        select: this.personDetailSelect(),
      });

      if (!updatedPerson) {
        throw new NotFoundException({
          code: 'PERSON_NOT_FOUND',
          message: '인물을 찾을 수 없습니다.',
          personId,
        });
      }

      await this.syncBirthdayNotificationJob(tx, userId, updatedPerson);

      return this.toPersonDetailResponse(tx, userId, updatedPerson);
    });
  }

  async addPersonProfileImage(
    userId: string,
    personId: string,
    image: PersonImageFile,
  ): Promise<PersonDetailResponse> {
    const existingPerson = await this.findExistingPersonForProfileImage(
      userId,
      personId,
    );

    if (existingPerson.profileImageFile) {
      throw new ConflictException({
        code: 'PERSON_PROFILE_IMAGE_ALREADY_EXISTS',
        message: '이미 프로필 이미지가 등록되어 있습니다.',
        personId,
      });
    }

    const uploadedFileKeys: string[] = [];

    try {
      const uploadedImage = await this.uploadPersonFile(
        image,
        `people/${userId}/profiles`,
        uploadedFileKeys,
      );

      return await this.prisma.$transaction(async (tx) => {
        const profileImageFile = await tx.mediaFile.create({
          data: this.toMediaFileCreateData(
            userId,
            uploadedImage,
            MediaFileUsage.PERSON_PROFILE,
          ),
        });
        const updateResult = await tx.person.updateMany({
          where: {
            id: personId,
            userId,
            profileImageFileId: null,
          },
          data: {
            profileImageFileId: profileImageFile.id,
          },
        });

        if (updateResult.count !== 1) {
          throw new ConflictException({
            code: 'PERSON_PROFILE_IMAGE_ALREADY_EXISTS',
            message: '이미 프로필 이미지가 등록되어 있습니다.',
            personId,
          });
        }

        return this.findPersonDetailOrThrow(tx, userId, personId);
      });
    } catch (error) {
      await this.deleteUploadedFiles(uploadedFileKeys);
      throw error;
    }
  }

  async updatePersonProfileImage(
    userId: string,
    personId: string,
    image: PersonImageFile,
  ): Promise<PersonDetailResponse> {
    const existingPerson = await this.findExistingPersonForProfileImage(
      userId,
      personId,
    );
    const existingImage = this.requireExistingProfileImage(
      existingPerson,
      personId,
    );
    const uploadedFileKeys: string[] = [];

    try {
      const uploadedImage = await this.uploadPersonFile(
        image,
        `people/${userId}/profiles`,
        uploadedFileKeys,
      );
      const updatedPerson = await this.prisma.$transaction(async (tx) => {
        const profileImageFile = await tx.mediaFile.create({
          data: this.toMediaFileCreateData(
            userId,
            uploadedImage,
            MediaFileUsage.PERSON_PROFILE,
          ),
        });

        await tx.person.update({
          where: {
            id_userId: {
              id: personId,
              userId,
            },
          },
          data: {
            profileImageFile: {
              connect: {
                id: profileImageFile.id,
              },
            },
          },
        });
        await tx.mediaFile.delete({
          where: {
            id: existingImage.id,
          },
        });

        return this.findPersonDetailOrThrow(tx, userId, personId);
      });

      await this.deleteUploadedFiles([existingImage.s3Key]);

      return updatedPerson;
    } catch (error) {
      await this.deleteUploadedFiles(uploadedFileKeys);
      throw error;
    }
  }

  async deletePersonProfileImage(
    userId: string,
    personId: string,
  ): Promise<PersonDetailResponse> {
    const existingPerson = await this.findExistingPersonForProfileImage(
      userId,
      personId,
    );
    const existingImage = this.requireExistingProfileImage(
      existingPerson,
      personId,
    );
    const updatedPerson = await this.prisma.$transaction(async (tx) => {
      await tx.person.update({
        where: {
          id_userId: {
            id: personId,
            userId,
          },
        },
        data: {
          profileImageFile: {
            disconnect: true,
          },
        },
      });
      await tx.mediaFile.delete({
        where: {
          id: existingImage.id,
        },
      });

      return this.findPersonDetailOrThrow(tx, userId, personId);
    });

    await this.deleteUploadedFiles([existingImage.s3Key]);

    return updatedPerson;
  }

  async deletePerson(
    userId: string,
    personId: string,
  ): Promise<DeletePersonResult> {
    let s3KeysToDelete: string[] = [];

    await this.prisma.$transaction(async (tx) => {
      const person = await tx.person.findFirst({
        where: {
          id: personId,
          userId,
        },
        select: this.personDeletionSelect(),
      });

      if (!person) {
        throw new NotFoundException({
          code: 'PERSON_NOT_FOUND',
          message: '인물을 찾을 수 없습니다.',
          personId,
        });
      }

      const deletionPlan = this.toPersonDeletionPlan(person);
      s3KeysToDelete = deletionPlan.s3Keys;

      if (deletionPlan.mediaFileIds.length > 0) {
        await tx.mediaFile.deleteMany({
          where: {
            userId,
            id: {
              in: deletionPlan.mediaFileIds,
            },
          },
        });
      }

      if (deletionPlan.sharedRecordIds.length > 0) {
        await tx.recordPerson.deleteMany({
          where: {
            userId,
            personId,
            recordId: {
              in: deletionPlan.sharedRecordIds,
            },
          },
        });
      }

      if (deletionPlan.orphanRecordIds.length > 0) {
        await tx.record.deleteMany({
          where: {
            userId,
            id: {
              in: deletionPlan.orphanRecordIds,
            },
          },
        });
      }

      await tx.person.deleteMany({
        where: {
          id: personId,
          userId,
        },
      });
    });

    await this.s3Service.deleteFiles(s3KeysToDelete);

    return {
      success: true,
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

  private async assertPhoneNumberIsAvailable(
    userId: string,
    phoneNumber: string,
    excludePersonId?: string,
  ): Promise<void> {
    const phoneNumberHash = this.hashPhoneNumber(phoneNumber);
    const existingPerson = await this.prisma.person.findFirst({
      where: {
        userId,
        phoneNumberHash,
        ...(excludePersonId ? { id: { not: excludePersonId } } : {}),
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

  private async findExistingPersonForUpdate(
    userId: string,
    personId: string,
  ): Promise<ExistingPersonForUpdate> {
    const existingPerson = await this.prisma.person.findFirst({
      where: {
        id: personId,
        userId,
      },
      select: {
        id: true,
        phoneNumber: true,
        phoneNumberHash: true,
        birthdayNotificationEnabled: true,
        birthdayNotificationOffsetMinutes: true,
      },
    });

    if (!existingPerson) {
      throw new NotFoundException({
        code: 'PERSON_NOT_FOUND',
        message: '인물을 찾을 수 없습니다.',
        personId,
      });
    }

    return existingPerson;
  }

  private async findExistingPersonForProfileImage(
    userId: string,
    personId: string,
  ): Promise<ExistingPersonForProfileImage> {
    const existingPerson = await this.prisma.person.findFirst({
      where: {
        id: personId,
        userId,
      },
      select: {
        id: true,
        profileImageFile: {
          select: {
            id: true,
            s3Key: true,
          },
        },
      },
    });

    if (!existingPerson) {
      throw new NotFoundException({
        code: 'PERSON_NOT_FOUND',
        message: '인물을 찾을 수 없습니다.',
        personId,
      });
    }

    return existingPerson;
  }

  private requireExistingProfileImage(
    existingPerson: ExistingPersonForProfileImage,
    personId: string,
  ): ExistingPersonProfileImageFile {
    if (!existingPerson.profileImageFile) {
      throw new NotFoundException({
        code: 'PERSON_PROFILE_IMAGE_NOT_FOUND',
        message: '프로필 이미지를 찾을 수 없습니다.',
        personId,
      });
    }

    return existingPerson.profileImageFile;
  }

  private toPersonUpdateData(
    item: UpdatePersonItemDto,
  ): Prisma.PersonUpdateInput {
    const data: Prisma.PersonUpdateInput = {};

    if (this.hasOwn(item, 'name')) {
      data.name = this.piiCryptoService.encrypt(item.name as string);
    }
    if (this.hasOwn(item, 'birthDate')) {
      data.birthDate = this.encryptNullable(item.birthDate);
      Object.assign(data, this.toBirthDatePartData(item.birthDate));
    }
    if (this.hasOwn(item, 'isImportant')) {
      data.isImportant = item.isImportant;
    }
    if (this.hasOwn(item, 'phoneNumber')) {
      const phoneNumber = item.phoneNumber as string;
      data.phoneNumber = this.piiCryptoService.encrypt(phoneNumber);
      data.phoneNumberHash = this.hashPhoneNumber(phoneNumber);
    }
    if (this.hasOwn(item, 'job')) {
      data.job = item.job;
    }
    if (this.hasOwn(item, 'company')) {
      data.company = item.company;
    }
    if (this.hasOwn(item, 'position')) {
      data.position = item.position;
    }
    if (this.hasOwn(item, 'relationship')) {
      data.relationship = item.relationship;
    }
    if (this.hasOwn(item, 'personality')) {
      data.personality = item.personality;
    }
    if (this.hasOwn(item, 'birthdayNotificationEnabled')) {
      data.birthdayNotificationEnabled = item.birthdayNotificationEnabled;
    }
    if (this.hasOwn(item, 'birthdayNotificationOffsetMinutes')) {
      data.birthdayNotificationOffsetMinutes =
        item.birthdayNotificationOffsetMinutes;
    }

    return data;
  }

  private async syncBirthdayNotificationJob(
    client: BirthdayNotificationJobClient,
    userId: string,
    person: {
      id: string;
      birthMonth: number | null;
      birthDay: number | null;
      birthdayNotificationEnabled: boolean;
      birthdayNotificationOffsetMinutes: number;
    },
  ): Promise<void> {
    if (
      !person.birthdayNotificationEnabled ||
      !person.birthMonth ||
      !person.birthDay
    ) {
      await client.notificationJob.updateMany({
        where: {
          userId,
          type: NotificationType.BIRTHDAY,
          personId: person.id,
          status: NotificationStatus.PENDING,
        },
        data: {
          status: NotificationStatus.CANCELED,
        },
      });
      return;
    }

    const scheduledBirthday = this.toNextBirthdayNotificationSchedule(
      person.birthMonth,
      person.birthDay,
      person.birthdayNotificationOffsetMinutes,
      new Date(),
    );
    const dedupeKey = this.toBirthdayNotificationDedupeKey(
      person.id,
      scheduledBirthday.year,
    );

    await client.notificationJob.updateMany({
      where: {
        userId,
        type: NotificationType.BIRTHDAY,
        personId: person.id,
        status: NotificationStatus.PENDING,
        dedupeKey: {
          not: dedupeKey,
        },
      },
      data: {
        status: NotificationStatus.CANCELED,
      },
    });

    await client.notificationJob.upsert({
      where: {
        userId_dedupeKey: {
          userId,
          dedupeKey,
        },
      },
      create: {
        userId,
        type: NotificationType.BIRTHDAY,
        personId: person.id,
        scheduledAt: scheduledBirthday.scheduledAt,
        dedupeKey,
      },
      update: {
        status: NotificationStatus.PENDING,
        scheduledAt: scheduledBirthday.scheduledAt,
        attemptCount: 0,
        sentAt: null,
        failedAt: null,
        lastAttemptAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  }

  private toNextBirthdayNotificationSchedule(
    birthMonth: number,
    birthDay: number,
    offsetMinutes: number,
    now: Date,
  ): { year: number; scheduledAt: Date } {
    const currentKstYear = new Date(
      now.getTime() + KST_OFFSET_HOURS * 60 * 60 * 1000,
    ).getUTCFullYear();
    const currentYearBirthdayAt = this.toBirthdayNotificationAt(
      birthMonth,
      birthDay,
      currentKstYear,
    );
    const targetYear =
      currentYearBirthdayAt.getTime() <= now.getTime()
        ? currentKstYear + 1
        : currentKstYear;

    return {
      year: targetYear,
      scheduledAt: new Date(
        this.toBirthdayNotificationAt(
          birthMonth,
          birthDay,
          targetYear,
        ).getTime() -
          offsetMinutes * 60 * 1000,
      ),
    };
  }

  private toBirthdayNotificationAt(
    birthMonth: number,
    birthDay: number,
    year: number,
  ): Date {
    return new Date(
      Date.UTC(
        year,
        birthMonth - 1,
        birthDay,
        BIRTHDAY_NOTIFICATION_HOUR_KST - KST_OFFSET_HOURS,
      ),
    );
  }

  private toBirthdayNotificationDedupeKey(
    personId: string,
    year: number,
  ): string {
    return `birthday:${personId}:${year}`;
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
    items: PersonCategoryNameSource[],
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
            content: this.piiCryptoService.encrypt(extraContact.content),
          },
          select: {
            id: true,
            type: true,
            content: true,
          },
        }),
      ),
    ).then((createdExtraContacts) =>
      createdExtraContacts.map((extraContact) => ({
        ...extraContact,
        content: this.piiCryptoService.decrypt(extraContact.content),
      })),
    );
  }

  private toCategoryCreateManyData(
    userId: string,
    names: (string | null | undefined)[],
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

  private async toPersonDetailResponse(
    client: PersonDetailClient,
    userId: string,
    person: PersonDetailQueryResult,
  ): Promise<PersonDetailResponse> {
    const { profileImageFile, businessCards } = person;
    const now = new Date();
    const [upcomingSchedules, records] = await Promise.all([
      this.getUpcomingSchedulesForPerson(client, userId, person.id, now),
      this.getRecordsForPerson(client, userId, person.id),
    ]);

    return {
      id: person.id,
      name: this.piiCryptoService.decrypt(person.name),
      birthDate: this.toDateOnlyString(person.birthDate),
      isImportant: person.isImportant,
      phoneNumber: this.piiCryptoService.decrypt(person.phoneNumber),
      job: person.job,
      company: person.company,
      position: person.position,
      relationship: person.relationship,
      personality: person.personality,
      birthdayNotificationEnabled: person.birthdayNotificationEnabled,
      birthdayNotificationOffsetMinutes:
        person.birthdayNotificationOffsetMinutes,
      extraContacts: person.extraContacts.map((extraContact) => ({
        ...extraContact,
        content: this.piiCryptoService.decrypt(extraContact.content),
      })),
      image: this.toSignedImageUrl(profileImageFile),
      businessCards: businessCards.map((businessCard) =>
        this.toBusinessCardResponse(businessCard),
      ),
      upcomingSchedules,
      records,
    };
  }

  private toMediaFileResponse(file: MediaFileResponseSource | null) {
    return file
      ? {
          id: file.id,
          url: this.s3Service.getSignedUrl(file.s3Key),
        }
      : null;
  }

  private async findPersonDetailOrThrow(
    client: PersonDetailClient,
    userId: string,
    personId: string,
  ): Promise<PersonDetailResponse> {
    const person = await client.person.findFirst({
      where: {
        id: personId,
        userId,
      },
      select: this.personDetailSelect(),
    });

    if (!person) {
      throw new NotFoundException({
        code: 'PERSON_NOT_FOUND',
        message: '인물을 찾을 수 없습니다.',
        personId,
      });
    }

    return this.toPersonDetailResponse(client, userId, person);
  }

  private async getUpcomingSchedulesForPerson(
    client: Pick<Prisma.TransactionClient, 'schedule'>,
    userId: string,
    personId: string,
    now: Date,
  ): Promise<HomeScheduleResponse[]> {
    const schedules = await client.schedule.findMany({
      where: {
        userId,
        scheduleTime: {
          gte: now,
        },
        people: {
          some: {
            userId,
            personId,
          },
        },
      },
      select: {
        id: true,
        title: true,
        scheduleTime: true,
      },
      orderBy: { scheduleTime: Prisma.SortOrder.asc },
      take: PERSON_UPCOMING_SCHEDULE_LIMIT,
    });

    return schedules.map((schedule) => ({
      id: schedule.id,
      title: this.piiCryptoService.decrypt(schedule.title),
      scheduleTime: schedule.scheduleTime.toISOString(),
      dDay: this.toDDay(now, schedule.scheduleTime),
    }));
  }

  private async getRecordsForPerson(
    client: Pick<Prisma.TransactionClient, 'record'>,
    userId: string,
    personId: string,
  ): Promise<HomeRecordResponse[]> {
    const records = await client.record.findMany({
      where: {
        userId,
        people: {
          some: {
            userId,
            personId,
          },
        },
      },
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
      people: record.people
        .map(({ person }) => this.piiCryptoService.decrypt(person.name))
        .sort((left, right) => left.localeCompare(right)),
      createdAt: record.createdAt.toISOString(),
      bookMark: record.bookMark,
      voiceDuration:
        record.type === RecordType.VOICE
          ? this.toMinuteSecond(record.voiceDurationSeconds)
          : null,
    }));
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

  private toDateOnlyString(date: string | Date | null): string | null {
    if (!date) {
      return null;
    }

    if (date instanceof Date) {
      return date.toISOString().slice(0, 10);
    }

    return this.piiCryptoService.decrypt(date);
  }

  private encryptNullable(value?: string | null): string | null | undefined {
    if (value === null) {
      return null;
    }

    return value ? this.piiCryptoService.encrypt(value) : undefined;
  }

  private toBirthDatePartData(date?: string | null): {
    birthMonth?: number | null;
    birthDay?: number | null;
  } {
    if (date === undefined) {
      return {};
    }

    if (date === null || date === '') {
      return {
        birthMonth: null,
        birthDay: null,
      };
    }

    const parsedDate = new Date(date);

    return {
      birthMonth: parsedDate.getUTCMonth() + 1,
      birthDay: parsedDate.getUTCDate(),
    };
  }

  private hashPhoneNumber(phoneNumber: string): string {
    return this.piiCryptoService.hash(
      this.piiCryptoService.normalizePhoneNumber(phoneNumber),
    ) as string;
  }

  private hasOwn<T extends object, K extends PropertyKey>(
    object: T,
    key: K,
  ): object is T & Record<K, unknown> {
    return Object.hasOwn(object, key);
  }

  private personDetailSelect() {
    return {
      id: true,
      name: true,
      birthDate: true,
      birthMonth: true,
      birthDay: true,
      isImportant: true,
      phoneNumber: true,
      job: true,
      company: true,
      position: true,
      relationship: true,
      personality: true,
      birthdayNotificationEnabled: true,
      birthdayNotificationOffsetMinutes: true,
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
              s3Key: true,
            },
          },
          backImageFile: {
            select: {
              id: true,
              s3Key: true,
            },
          },
        },
        orderBy: { createdAt: Prisma.SortOrder.asc },
      },
    };
  }

  private personDeletionSelect() {
    return {
      id: true,
      profileImageFile: {
        select: {
          id: true,
          s3Key: true,
        },
      },
      businessCards: {
        select: {
          frontImageFile: {
            select: {
              id: true,
              s3Key: true,
            },
          },
          backImageFile: {
            select: {
              id: true,
              s3Key: true,
            },
          },
        },
      },
      records: {
        select: {
          recordId: true,
          record: {
            select: {
              id: true,
              voiceFile: {
                select: {
                  id: true,
                  s3Key: true,
                },
              },
              _count: {
                select: {
                  people: true,
                },
              },
            },
          },
        },
      },
    };
  }

  private toPersonDeletionPlan(person: PersonForDeletion): PersonDeletionPlan {
    const mediaFileIds = new Set<string>();
    const s3Keys = new Set<string>();
    const orphanRecordIds: string[] = [];
    const sharedRecordIds: string[] = [];
    const addMediaFile = (file: MediaFileForDeletion | null) => {
      if (!file) {
        return;
      }

      mediaFileIds.add(file.id);
      s3Keys.add(file.s3Key);
    };

    addMediaFile(person.profileImageFile);

    for (const businessCard of person.businessCards) {
      addMediaFile(businessCard.frontImageFile);
      addMediaFile(businessCard.backImageFile);
    }

    for (const recordPerson of person.records) {
      const record = recordPerson.record;

      if (record._count.people <= 1) {
        orphanRecordIds.push(record.id);
        addMediaFile(record.voiceFile);
      } else {
        sharedRecordIds.push(record.id);
      }
    }

    return {
      mediaFileIds: [...mediaFileIds],
      s3Keys: [...s3Keys],
      orphanRecordIds,
      sharedRecordIds,
    };
  }

  private async deleteUploadedFiles(keys: string[]): Promise<void> {
    // cleanup 실패가 원래 오류를 덮지 않도록 allSettled를 사용한다.
    await Promise.allSettled(keys.map((key) => this.s3Service.deleteFile(key)));
  }
}
