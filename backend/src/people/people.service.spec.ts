import { ConflictException, NotFoundException } from '@nestjs/common';
import {
  MediaFileType,
  MediaFileUsage,
  Prisma,
  RecordType,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../s3/s3.service';
import {
  DEFAULT_JOB_NAMES,
  DEFAULT_POSITION_NAMES,
  DEFAULT_RELATIONSHIP_NAMES,
} from './people.constants';
import { PeopleService } from './people.service';

interface CategoryDelegateMock {
  createMany: jest.Mock;
  findMany: jest.Mock;
}

interface TestTransactionClient {
  job: CategoryDelegateMock;
  company: CategoryDelegateMock;
  position: CategoryDelegateMock;
  relationship: CategoryDelegateMock;
  person: {
    create: jest.Mock;
    createManyAndReturn: jest.Mock;
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  mediaFile: {
    create: jest.Mock;
    delete: jest.Mock;
    deleteMany: jest.Mock;
  };
  businessCard: {
    create: jest.Mock;
  };
  extraContact: {
    create: jest.Mock;
    deleteMany: jest.Mock;
  };
  schedule: {
    findMany: jest.Mock;
  };
  record: {
    findMany: jest.Mock;
    deleteMany: jest.Mock;
  };
  recordPerson: {
    deleteMany: jest.Mock;
  };
  notificationJob: {
    create: jest.Mock;
    updateMany: jest.Mock;
    upsert: jest.Mock;
  };
}

interface PrismaMock extends TestTransactionClient {
  $transaction: jest.Mock;
}

type TestTransactionInput =
  | unknown[]
  | ((tx: TestTransactionClient) => unknown);

describe('PeopleService', () => {
  let prisma: PrismaMock;
  let s3Service: {
    uploadFile: jest.Mock;
    deleteFile: jest.Mock;
    deleteFiles: jest.Mock;
    getSignedUrl: jest.Mock;
  };
  let service: PeopleService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-29T01:00:00.000Z'));
    prisma = {
      $transaction: jest
        .fn()
        .mockImplementation((input: TestTransactionInput) => {
          if (Array.isArray(input)) {
            return Promise.resolve(input);
          }

          const transactionClient: TestTransactionClient = {
            job: prisma.job,
            company: prisma.company,
            position: prisma.position,
            relationship: prisma.relationship,
            person: prisma.person,
            mediaFile: prisma.mediaFile,
            businessCard: prisma.businessCard,
            extraContact: prisma.extraContact,
            schedule: prisma.schedule,
            record: prisma.record,
            recordPerson: prisma.recordPerson,
            notificationJob: prisma.notificationJob,
          };

          return input(transactionClient);
        }),
      job: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      company: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      position: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      relationship: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
      person: {
        create: jest.fn(),
        createManyAndReturn: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        deleteMany: jest.fn(),
      },
      mediaFile: {
        create: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      businessCard: {
        create: jest.fn(),
      },
      extraContact: {
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      schedule: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      record: {
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn(),
      },
      recordPerson: {
        deleteMany: jest.fn(),
      },
      notificationJob: {
        create: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
    };
    s3Service = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      deleteFiles: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn(
        (key: string) => `https://signed.example.com/${key}`,
      ),
    };
    service = new PeopleService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('ensures default categories and returns category names from the database', async () => {
    prisma.job.findMany.mockResolvedValue([
      { name: '개발/IT' },
      { name: '마케팅/홍보' },
      { name: '회계' },
    ]);
    prisma.company.findMany.mockResolvedValue([{ name: '토스' }]);
    prisma.position.findMany.mockResolvedValue([
      { name: '과장' },
      { name: '차장' },
    ]);
    prisma.relationship.findMany.mockResolvedValue([
      { name: '가족' },
      { name: '동료' },
    ]);

    await expect(service.getCategoryNames('user-1')).resolves.toEqual({
      jobs: ['개발/IT', '마케팅/홍보', '회계'],
      companies: ['토스'],
      positions: ['과장', '차장'],
      relationships: ['가족', '동료'],
    });

    expect(prisma.job.createMany).toHaveBeenCalledWith({
      data: DEFAULT_JOB_NAMES.map((name) => ({ userId: 'user-1', name })),
      skipDuplicates: true,
    });
    expect(prisma.position.createMany).toHaveBeenCalledWith({
      data: DEFAULT_POSITION_NAMES.map((name) => ({ userId: 'user-1', name })),
      skipDuplicates: true,
    });
    expect(prisma.relationship.createMany).toHaveBeenCalledWith({
      data: DEFAULT_RELATIONSHIP_NAMES.map((name) => ({
        userId: 'user-1',
        name,
      })),
      skipDuplicates: true,
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      undefined,
      undefined,
      undefined,
    ]);
    expect(prisma.job.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { name: true },
      orderBy: { name: Prisma.SortOrder.asc },
    });
    expect(prisma.company.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { name: true },
      orderBy: { name: Prisma.SortOrder.asc },
    });
    expect(prisma.position.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { name: true },
      orderBy: { name: Prisma.SortOrder.asc },
    });
    expect(prisma.relationship.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { name: true },
      orderBy: { name: Prisma.SortOrder.asc },
    });
  });

  it('returns current user people list with only profile fields', async () => {
    prisma.person.findMany.mockResolvedValue([
      {
        id: 'person-1',
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        isImportant: true,
        job: '개발/IT',
        company: '토스',
        position: '과장',
        relationship: '동료',
        updatedAt: new Date('2026-06-28T08:00:00.000Z'),
        profileImageFile: {
          s3Key: 'profiles/profile.png',
        },
      },
      {
        id: 'person-2',
        name: '김영희',
        phoneNumber: '010-9999-0000',
        isImportant: false,
        job: null,
        company: null,
        position: null,
        relationship: null,
        updatedAt: new Date('2026-06-28T09:00:00.000Z'),
        profileImageFile: null,
      },
    ]);

    await expect(service.getPeople('user-1')).resolves.toEqual([
      {
        id: 'person-1',
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        image: 'https://signed.example.com/profiles/profile.png',
        isImportant: true,
        job: '개발/IT',
        company: '토스',
        position: '과장',
        relationship: '동료',
        updatedAt: '2026-06-28T08:00:00.000Z',
      },
      {
        id: 'person-2',
        name: '김영희',
        phoneNumber: '010-9999-0000',
        image: null,
        isImportant: false,
        job: null,
        company: null,
        position: null,
        relationship: null,
        updatedAt: '2026-06-28T09:00:00.000Z',
      },
    ]);

    expect(prisma.person.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
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
    expect(s3Service.getSignedUrl).toHaveBeenCalledWith('profiles/profile.png');
  });

  it('returns one current user person detail with related contacts and business cards', async () => {
    prisma.person.findFirst.mockResolvedValue({
      id: 'person-1',
      name: '홍길동',
      birthDate: new Date('1990-01-01'),
      isImportant: true,
      phoneNumber: '010-1234-5678',
      job: '개발/IT',
      company: '토스',
      position: '과장',
      relationship: '동료',
      personality: '꼼꼼함',
      birthdayNotificationEnabled: true,
      birthdayNotificationOffsetMinutes: 1,
      profileImageFile: {
        s3Key: 'profiles/profile.png',
      },
      extraContacts: [
        {
          id: 'extra-contact-1',
          type: 'email',
          content: 'user@example.com',
        },
      ],
      businessCards: [
        {
          id: 'business-card-1',
          frontImageFile: {
            id: 'front-media-id',
            type: MediaFileType.IMAGE,
            usage: MediaFileUsage.BUSINESS_CARD_FRONT,
            bucket: 'bucket',
            s3Key: 'cards/front.jpg',
            contentType: 'image/jpeg',
            sizeBytes: 5,
            originalName: 'front.jpg',
          },
          backImageFile: null,
        },
      ],
    });
    prisma.schedule.findMany.mockResolvedValueOnce([
      {
        id: 'schedule-1',
        title: '오늘 미팅',
        scheduleTime: new Date('2026-06-29T08:00:00.000Z'),
      },
      {
        id: 'schedule-2',
        title: '내일 점심',
        scheduleTime: new Date('2026-06-30T03:00:00.000Z'),
      },
    ]);
    prisma.record.findMany.mockResolvedValueOnce([
      {
        id: 'record-1',
        type: RecordType.VOICE,
        title: '최근 통화 기록',
        createdAt: new Date('2026-06-29T00:30:00.000Z'),
        voiceDurationSeconds: 125,
        people: [
          {
            person: {
              name: '김영희',
            },
          },
          {
            person: {
              name: '홍길동',
            },
          },
        ],
      },
      {
        id: 'record-2',
        type: RecordType.TEXT,
        title: '이전 미팅 기록',
        createdAt: new Date('2026-06-28T03:00:00.000Z'),
        voiceDurationSeconds: null,
        people: [
          {
            person: {
              name: '홍길동',
            },
          },
        ],
      },
    ]);

    await expect(service.getPerson('user-1', 'person-1')).resolves.toEqual({
      id: 'person-1',
      name: '홍길동',
      birthDate: '1990-01-01',
      image: 'https://signed.example.com/profiles/profile.png',
      isImportant: true,
      phoneNumber: '010-1234-5678',
      job: '개발/IT',
      company: '토스',
      position: '과장',
      relationship: '동료',
      personality: '꼼꼼함',
      birthdayNotificationEnabled: true,
      birthdayNotificationOffsetMinutes: 1,
      extraContacts: [
        {
          id: 'extra-contact-1',
          type: 'email',
          content: 'user@example.com',
        },
      ],
      businessCards: [
        {
          id: 'business-card-1',
          frontImageFile: {
            id: 'front-media-id',
            url: 'https://signed.example.com/cards/front.jpg',
          },
          backImageFile: null,
        },
      ],
      upcomingSchedules: [
        {
          id: 'schedule-1',
          title: '오늘 미팅',
          scheduleTime: '2026-06-29T08:00:00.000Z',
          dDay: 'D-0',
        },
        {
          id: 'schedule-2',
          title: '내일 점심',
          scheduleTime: '2026-06-30T03:00:00.000Z',
          dDay: 'D-1',
        },
      ],
      records: [
        {
          id: 'record-1',
          type: RecordType.VOICE,
          title: '최근 통화 기록',
          people: ['김영희', '홍길동'],
          createdAt: '2026-06-29T00:30:00.000Z',
          voiceDuration: '02:05',
        },
        {
          id: 'record-2',
          type: RecordType.TEXT,
          title: '이전 미팅 기록',
          people: ['홍길동'],
          createdAt: '2026-06-28T03:00:00.000Z',
          voiceDuration: null,
        },
      ],
    });

    expect(prisma.person.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'person-1',
        userId: 'user-1',
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
      },
    });
    expect(prisma.schedule.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        scheduleTime: {
          gte: new Date('2026-06-29T01:00:00.000Z'),
        },
        people: {
          some: {
            userId: 'user-1',
            personId: 'person-1',
          },
        },
      },
      select: {
        id: true,
        title: true,
        scheduleTime: true,
      },
      orderBy: { scheduleTime: Prisma.SortOrder.asc },
      take: 5,
    });
    expect(prisma.record.findMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        people: {
          some: {
            userId: 'user-1',
            personId: 'person-1',
          },
        },
      },
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
    expect(s3Service.getSignedUrl).toHaveBeenCalledWith('profiles/profile.png');
    expect(s3Service.getSignedUrl).toHaveBeenCalledWith('cards/front.jpg');
  });

  it('throws not found when current user person detail does not exist', async () => {
    prisma.person.findFirst.mockResolvedValue(null);

    await expect(
      service.getPerson('user-1', 'person-missing'),
    ).rejects.toMatchObject({
      response: {
        code: 'PERSON_NOT_FOUND',
        message: '인물을 찾을 수 없습니다.',
        personId: 'person-missing',
      },
    });
    await expect(
      service.getPerson('user-1', 'person-missing'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('updates person fields without touching profile image, business cards, or extra contacts when omitted', async () => {
    const updatedPerson = {
      id: 'person-1',
      name: '홍길동',
      birthDate: null,
      isImportant: true,
      phoneNumber: '010-1234-5678',
      job: null,
      company: '토스',
      position: null,
      relationship: null,
      personality: '꼼꼼함',
      birthdayNotificationEnabled: false,
      birthdayNotificationOffsetMinutes: 1,
      profileImageFile: {
        s3Key: 'profiles/profile.png',
      },
      extraContacts: [
        {
          id: 'extra-contact-1',
          type: 'email',
          content: 'user@example.com',
        },
      ],
      businessCards: [],
    };
    prisma.person.findFirst
      .mockResolvedValueOnce({
        id: 'person-1',
        phoneNumber: '010-1234-5678',
        birthdayNotificationEnabled: true,
        birthdayNotificationOffsetMinutes: 1,
      })
      .mockResolvedValueOnce(updatedPerson);

    const { profileImageFile: _profileImageFile, ...expectedPerson } =
      updatedPerson;

    await expect(
      service.updatePerson('user-1', 'person-1', {
        name: '홍길동',
        birthDate: null,
        isImportant: true,
        company: '토스',
        personality: '꼼꼼함',
        birthdayNotificationEnabled: false,
      }),
    ).resolves.toEqual({
      ...expectedPerson,
      birthDate: null,
      image: 'https://signed.example.com/profiles/profile.png',
      businessCards: [],
      upcomingSchedules: [],
      records: [],
    });

    expect(prisma.company.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', name: '토스' }],
      skipDuplicates: true,
    });
    expect(prisma.person.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: 'person-1',
          userId: 'user-1',
        },
      },
      data: {
        name: '홍길동',
        birthDate: null,
        isImportant: true,
        company: '토스',
        personality: '꼼꼼함',
        birthdayNotificationEnabled: false,
      },
    });
    expect(prisma.extraContact.deleteMany).not.toHaveBeenCalled();
    expect(prisma.extraContact.create).not.toHaveBeenCalled();
    expect(s3Service.uploadFile).not.toHaveBeenCalled();
    expect(prisma.mediaFile.create).not.toHaveBeenCalled();
    expect(prisma.businessCard.create).not.toHaveBeenCalled();
  });

  it('replaces extra contacts only when extraContacts is present', async () => {
    const updatedPerson = {
      id: 'person-1',
      name: '홍길동',
      birthDate: null,
      isImportant: false,
      phoneNumber: '010-1234-5678',
      job: null,
      company: null,
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: false,
      birthdayNotificationOffsetMinutes: 1,
      profileImageFile: null,
      extraContacts: [],
      businessCards: [],
    };
    prisma.person.findFirst
      .mockResolvedValueOnce({
        id: 'person-1',
        phoneNumber: '010-1234-5678',
        birthdayNotificationEnabled: false,
        birthdayNotificationOffsetMinutes: 1,
      })
      .mockResolvedValueOnce(updatedPerson);

    const { profileImageFile: _profileImageFile, ...expectedPerson } =
      updatedPerson;

    await expect(
      service.updatePerson('user-1', 'person-1', {
        extraContacts: [],
      }),
    ).resolves.toEqual({
      ...expectedPerson,
      birthDate: null,
      image: null,
      businessCards: [],
      upcomingSchedules: [],
      records: [],
    });

    expect(prisma.person.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: 'person-1',
          userId: 'user-1',
        },
      },
      data: {},
    });
    expect(prisma.extraContact.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        personId: 'person-1',
      },
    });
    expect(prisma.extraContact.create).not.toHaveBeenCalled();
  });

  it('rejects duplicate phone numbers on person update excluding the current person', async () => {
    prisma.person.findFirst
      .mockResolvedValueOnce({
        id: 'person-1',
        phoneNumber: '010-1234-5678',
        birthdayNotificationEnabled: false,
        birthdayNotificationOffsetMinutes: 1,
      })
      .mockResolvedValueOnce({ id: 'person-2' });

    await expect(
      service.updatePerson('user-1', 'person-1', {
        phoneNumber: '010-9999-0000',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PERSON_PHONE_NUMBER_ALREADY_EXISTS',
        message: '이미 등록된 전화번호입니다.',
        phoneNumber: '010-9999-0000',
      },
    });

    expect(prisma.person.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        userId: 'user-1',
        phoneNumber: '010-9999-0000',
        id: { not: 'person-1' },
      },
      select: {
        id: true,
      },
    });
    expect(prisma.person.update).not.toHaveBeenCalled();
  });

  it('updates birthday notification enabled without requiring offset in the payload', async () => {
    const updatedPerson = {
      id: 'person-1',
      name: '홍길동',
      birthDate: null,
      isImportant: false,
      phoneNumber: '010-1234-5678',
      job: null,
      company: null,
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: true,
      birthdayNotificationOffsetMinutes: 1,
      profileImageFile: null,
      extraContacts: [],
      businessCards: [],
    };
    prisma.person.findFirst
      .mockResolvedValueOnce({
        id: 'person-1',
        phoneNumber: '010-1234-5678',
        birthdayNotificationEnabled: false,
        birthdayNotificationOffsetMinutes: 1,
      })
      .mockResolvedValueOnce(updatedPerson);

    const { profileImageFile: _profileImageFile, ...expectedPerson } =
      updatedPerson;

    await expect(
      service.updatePerson('user-1', 'person-1', {
        birthdayNotificationEnabled: true,
      }),
    ).resolves.toEqual({
      ...expectedPerson,
      birthDate: null,
      image: null,
      businessCards: [],
      upcomingSchedules: [],
      records: [],
    });
    expect(prisma.person.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: 'person-1',
          userId: 'user-1',
        },
      },
      data: {
        birthdayNotificationEnabled: true,
      },
    });
  });

  it('throws not found when updating a missing current user person', async () => {
    prisma.person.findFirst.mockResolvedValue(null);

    await expect(
      service.updatePerson('user-1', 'person-missing', {
        name: '홍길동',
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PERSON_NOT_FOUND',
        message: '인물을 찾을 수 없습니다.',
        personId: 'person-missing',
      },
    });
    await expect(
      service.updatePerson('user-1', 'person-missing', {
        name: '홍길동',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('adds a profile image only when the person does not already have one', async () => {
    const image = {
      buffer: Buffer.from('profile'),
      mimetype: 'image/png',
      originalname: 'profile.png',
      size: 7,
    };
    const updatedPerson = {
      id: 'person-1',
      name: '홍길동',
      birthDate: null,
      isImportant: false,
      phoneNumber: '010-1234-5678',
      job: null,
      company: null,
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: false,
      birthdayNotificationOffsetMinutes: 1,
      profileImageFile: {
        s3Key: 'profiles/new.png',
      },
      extraContacts: [],
      businessCards: [],
    };
    prisma.person.findFirst
      .mockResolvedValueOnce({
        id: 'person-1',
        profileImageFile: null,
      })
      .mockResolvedValueOnce(updatedPerson);
    s3Service.uploadFile.mockResolvedValueOnce({
      bucket: 'bucket',
      key: 'profiles/new.png',
      url: 'https://cdn.example.com/new.png',
      contentType: 'image/png',
      size: 7,
    });
    prisma.mediaFile.create.mockResolvedValueOnce({
      id: 'profile-media-id',
    });
    prisma.person.updateMany.mockResolvedValueOnce({ count: 1 });

    const { profileImageFile: _profileImageFile, ...expectedPerson } =
      updatedPerson;

    await expect(
      service.addPersonProfileImage('user-1', 'person-1', image),
    ).resolves.toEqual({
      ...expectedPerson,
      birthDate: null,
      image: 'https://signed.example.com/profiles/new.png',
      businessCards: [],
      upcomingSchedules: [],
      records: [],
    });

    expect(s3Service.uploadFile).toHaveBeenCalledWith({
      body: image.buffer,
      contentType: 'image/png',
      originalName: 'profile.png',
      prefix: 'people/user-1/profiles',
    });
    expect(prisma.mediaFile.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        type: MediaFileType.IMAGE,
        usage: MediaFileUsage.PERSON_PROFILE,
        bucket: 'bucket',
        s3Key: 'profiles/new.png',
        contentType: 'image/png',
        sizeBytes: 7,
        originalName: 'profile.png',
      },
    });
    expect(prisma.person.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'person-1',
        userId: 'user-1',
        profileImageFileId: null,
      },
      data: {
        profileImageFileId: 'profile-media-id',
      },
    });
    expect(s3Service.deleteFile).not.toHaveBeenCalled();
  });

  it('rejects adding a profile image when one already exists before uploading', async () => {
    prisma.person.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      profileImageFile: {
        id: 'old-media-id',
        s3Key: 'profiles/old.png',
      },
    });

    await expect(
      service.addPersonProfileImage('user-1', 'person-1', {
        buffer: Buffer.from('profile'),
        mimetype: 'image/png',
        originalname: 'profile.png',
        size: 7,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PERSON_PROFILE_IMAGE_ALREADY_EXISTS',
        message: '이미 프로필 이미지가 등록되어 있습니다.',
        personId: 'person-1',
      },
    });

    expect(s3Service.uploadFile).not.toHaveBeenCalled();
    expect(prisma.mediaFile.create).not.toHaveBeenCalled();
  });

  it('replaces an existing profile image and deletes the old object after database update', async () => {
    const image = {
      buffer: Buffer.from('new-profile'),
      mimetype: 'image/jpeg',
      originalname: 'new-profile.jpg',
      size: 11,
    };
    const updatedPerson = {
      id: 'person-1',
      name: '홍길동',
      birthDate: null,
      isImportant: false,
      phoneNumber: '010-1234-5678',
      job: null,
      company: null,
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: false,
      birthdayNotificationOffsetMinutes: 1,
      profileImageFile: {
        s3Key: 'profiles/new.jpg',
      },
      extraContacts: [],
      businessCards: [],
    };
    prisma.person.findFirst
      .mockResolvedValueOnce({
        id: 'person-1',
        profileImageFile: {
          id: 'old-media-id',
          s3Key: 'profiles/old.png',
        },
      })
      .mockResolvedValueOnce(updatedPerson);
    s3Service.uploadFile.mockResolvedValueOnce({
      bucket: 'bucket',
      key: 'profiles/new.jpg',
      url: 'https://cdn.example.com/new.jpg',
      contentType: 'image/jpeg',
      size: 11,
    });
    prisma.mediaFile.create.mockResolvedValueOnce({
      id: 'new-media-id',
    });

    const { profileImageFile: _profileImageFile, ...expectedPerson } =
      updatedPerson;

    await expect(
      service.updatePersonProfileImage('user-1', 'person-1', image),
    ).resolves.toEqual({
      ...expectedPerson,
      birthDate: null,
      image: 'https://signed.example.com/profiles/new.jpg',
      businessCards: [],
      upcomingSchedules: [],
      records: [],
    });

    expect(prisma.person.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: 'person-1',
          userId: 'user-1',
        },
      },
      data: {
        profileImageFile: {
          connect: {
            id: 'new-media-id',
          },
        },
      },
    });
    expect(prisma.mediaFile.delete).toHaveBeenCalledWith({
      where: {
        id: 'old-media-id',
      },
    });
    expect(s3Service.deleteFile).toHaveBeenCalledWith('profiles/old.png');
  });

  it('deletes an existing profile image from person, media file, and S3', async () => {
    const updatedPerson = {
      id: 'person-1',
      name: '홍길동',
      birthDate: null,
      isImportant: false,
      phoneNumber: '010-1234-5678',
      job: null,
      company: null,
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: false,
      birthdayNotificationOffsetMinutes: 1,
      profileImageFile: null,
      extraContacts: [],
      businessCards: [],
    };
    prisma.person.findFirst
      .mockResolvedValueOnce({
        id: 'person-1',
        profileImageFile: {
          id: 'old-media-id',
          s3Key: 'profiles/old.png',
        },
      })
      .mockResolvedValueOnce(updatedPerson);

    const { profileImageFile: _profileImageFile, ...expectedPerson } =
      updatedPerson;

    await expect(
      service.deletePersonProfileImage('user-1', 'person-1'),
    ).resolves.toEqual({
      ...expectedPerson,
      birthDate: null,
      image: null,
      businessCards: [],
      upcomingSchedules: [],
      records: [],
    });

    expect(prisma.person.update).toHaveBeenCalledWith({
      where: {
        id_userId: {
          id: 'person-1',
          userId: 'user-1',
        },
      },
      data: {
        profileImageFile: {
          disconnect: true,
        },
      },
    });
    expect(prisma.mediaFile.delete).toHaveBeenCalledWith({
      where: {
        id: 'old-media-id',
      },
    });
    expect(s3Service.deleteFile).toHaveBeenCalledWith('profiles/old.png');
  });

  it('throws not found when updating or deleting a missing profile image', async () => {
    prisma.person.findFirst.mockResolvedValue({
      id: 'person-1',
      profileImageFile: null,
    });

    await expect(
      service.updatePersonProfileImage('user-1', 'person-1', {
        buffer: Buffer.from('profile'),
        mimetype: 'image/png',
        originalname: 'profile.png',
        size: 7,
      }),
    ).rejects.toMatchObject({
      response: {
        code: 'PERSON_PROFILE_IMAGE_NOT_FOUND',
        message: '프로필 이미지를 찾을 수 없습니다.',
        personId: 'person-1',
      },
    });
    await expect(
      service.deletePersonProfileImage('user-1', 'person-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(s3Service.uploadFile).not.toHaveBeenCalled();
    expect(prisma.person.update).not.toHaveBeenCalled();
  });

  it('throws not found when deleting a missing current user person', async () => {
    prisma.person.findFirst.mockResolvedValue(null);

    await expect(
      service.deletePerson('user-1', 'person-missing'),
    ).rejects.toMatchObject({
      response: {
        code: 'PERSON_NOT_FOUND',
        message: '인물을 찾을 수 없습니다.',
        personId: 'person-missing',
      },
    });
    await expect(
      service.deletePerson('user-1', 'person-missing'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.mediaFile.deleteMany).not.toHaveBeenCalled();
    expect(prisma.recordPerson.deleteMany).not.toHaveBeenCalled();
    expect(prisma.record.deleteMany).not.toHaveBeenCalled();
    expect(prisma.person.deleteMany).not.toHaveBeenCalled();
    expect(s3Service.deleteFiles).not.toHaveBeenCalled();
  });

  it('deletes a person with owned media and deletes only orphan records', async () => {
    prisma.person.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      profileImageFile: {
        id: 'profile-media-id',
        s3Key: 'profiles/profile.png',
      },
      businessCards: [
        {
          frontImageFile: {
            id: 'front-media-id',
            s3Key: 'cards/front.jpg',
          },
          backImageFile: {
            id: 'back-media-id',
            s3Key: 'cards/back.jpg',
          },
        },
      ],
      records: [
        {
          recordId: 'record-orphan',
          record: {
            id: 'record-orphan',
            voiceFile: {
              id: 'voice-media-id',
              s3Key: 'records/voice.m4a',
            },
            _count: {
              people: 1,
            },
          },
        },
        {
          recordId: 'record-shared',
          record: {
            id: 'record-shared',
            voiceFile: {
              id: 'shared-voice-media-id',
              s3Key: 'records/shared-voice.m4a',
            },
            _count: {
              people: 2,
            },
          },
        },
      ],
    });

    await expect(service.deletePerson('user-1', 'person-1')).resolves.toEqual({
      success: true,
    });

    expect(prisma.person.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'person-1',
          userId: 'user-1',
        },
      }),
    );
    expect(prisma.mediaFile.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        id: {
          in: [
            'profile-media-id',
            'front-media-id',
            'back-media-id',
            'voice-media-id',
          ],
        },
      },
    });
    expect(prisma.recordPerson.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        personId: 'person-1',
        recordId: {
          in: ['record-shared'],
        },
      },
    });
    expect(prisma.record.deleteMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        id: {
          in: ['record-orphan'],
        },
      },
    });
    expect(prisma.person.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'person-1',
        userId: 'user-1',
      },
    });
    expect(s3Service.deleteFiles).toHaveBeenCalledWith([
      'profiles/profile.png',
      'cards/front.jpg',
      'cards/back.jpg',
      'records/voice.m4a',
    ]);
  });

  it('deletes a person without S3 files without touching media or records', async () => {
    prisma.person.findFirst.mockResolvedValueOnce({
      id: 'person-1',
      profileImageFile: null,
      businessCards: [],
      records: [],
    });

    await expect(service.deletePerson('user-1', 'person-1')).resolves.toEqual({
      success: true,
    });

    expect(prisma.mediaFile.deleteMany).not.toHaveBeenCalled();
    expect(prisma.recordPerson.deleteMany).not.toHaveBeenCalled();
    expect(prisma.record.deleteMany).not.toHaveBeenCalled();
    expect(prisma.person.deleteMany).toHaveBeenCalledWith({
      where: {
        id: 'person-1',
        userId: 'user-1',
      },
    });
    expect(s3Service.deleteFiles).toHaveBeenCalledWith([]);
  });

  it('imports contact people with only name and phone number', async () => {
    prisma.person.createManyAndReturn.mockResolvedValue([
      {
        id: 'person-1',
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        isImportant: false,
      },
      {
        id: 'person-2',
        name: '김영희',
        phoneNumber: '010-1234-5678',
        isImportant: false,
      },
    ]);

    await expect(
      service.importPeople('user-1', [
        {
          name: '홍길동',
          phoneNumber: '010-1234-5678',
        },
        {
          name: '김영희',
          phoneNumber: '010-1234-5678',
        },
      ]),
    ).resolves.toEqual([
      {
        id: 'person-1',
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        image: null,
        isImportant: false,
      },
      {
        id: 'person-2',
        name: '김영희',
        phoneNumber: '010-1234-5678',
        image: null,
        isImportant: false,
      },
    ]);

    expect(prisma.person.createManyAndReturn).toHaveBeenCalledWith({
      data: [
        {
          userId: 'user-1',
          name: '홍길동',
          phoneNumber: '010-1234-5678',
        },
        {
          userId: 'user-1',
          name: '김영희',
          phoneNumber: '010-1234-5678',
        },
      ],
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        isImportant: true,
      },
    });
    expect(s3Service.uploadFile).not.toHaveBeenCalled();
    expect(prisma.mediaFile.create).not.toHaveBeenCalled();
    expect(prisma.businessCard.create).not.toHaveBeenCalled();
    expect(prisma.extraContact.create).not.toHaveBeenCalled();
    expect(prisma.job.createMany).not.toHaveBeenCalled();
    expect(prisma.company.createMany).not.toHaveBeenCalled();
    expect(prisma.position.createMany).not.toHaveBeenCalled();
    expect(prisma.relationship.createMany).not.toHaveBeenCalled();
  });

  it('creates one person in one transaction and stores missing category names', async () => {
    const firstPerson = {
      id: 'person-1',
      userId: 'user-1',
      name: '홍길동',
      profileImageFileId: null,
      birthDate: new Date('1990-01-01'),
      isImportant: true,
      phoneNumber: '010-1234-5678',
      job: '개발/IT',
      company: '토스',
      position: '과장',
      relationship: '동료',
      personality: '꼼꼼함',
      birthdayNotificationEnabled: true,
      birthdayNotificationOffsetMinutes: 1,
      createdAt: new Date('2026-06-25T00:00:00.000Z'),
      updatedAt: new Date('2026-06-25T00:00:00.000Z'),
    };
    prisma.person.create.mockResolvedValueOnce(firstPerson);

    await expect(
      service.createPerson(
        'user-1',
        {
          name: '홍길동',
          birthDate: '1990-01-01',
          isImportant: true,
          phoneNumber: '010-1234-5678',
          job: '개발/IT',
          company: '토스',
          position: '과장',
          relationship: '동료',
          personality: '꼼꼼함',
          birthdayNotificationEnabled: true,
          birthdayNotificationOffsetMinutes: 1,
        },
        {},
      ),
    ).resolves.toEqual({
      ...firstPerson,
      birthDate: '1990-01-01',
      image: null,
      extraContacts: [],
      businessCards: [],
    });

    expect(prisma.job.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', name: '개발/IT' }],
      skipDuplicates: true,
    });
    expect(prisma.company.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', name: '토스' }],
      skipDuplicates: true,
    });
    expect(prisma.position.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', name: '과장' }],
      skipDuplicates: true,
    });
    expect(prisma.relationship.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', name: '동료' }],
      skipDuplicates: true,
    });
    expect(prisma.person.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: '홍길동',
        profileImageFileId: undefined,
        birthDate: new Date('1990-01-01'),
        isImportant: true,
        phoneNumber: '010-1234-5678',
        job: '개발/IT',
        company: '토스',
        position: '과장',
        relationship: '동료',
        personality: '꼼꼼함',
        birthdayNotificationEnabled: true,
        birthdayNotificationOffsetMinutes: 1,
      },
    });
    expect(prisma.notificationJob.upsert).toHaveBeenCalledWith({
      where: {
        userId_dedupeKey: {
          userId: 'user-1',
          dedupeKey: 'birthday:person-1:2027',
        },
      },
      create: {
        userId: 'user-1',
        type: 'BIRTHDAY',
        personId: 'person-1',
        scheduledAt: new Date('2026-12-31T23:59:00.000Z'),
        dedupeKey: 'birthday:person-1:2027',
      },
      update: {
        status: 'PENDING',
        scheduledAt: new Date('2026-12-31T23:59:00.000Z'),
        attemptCount: 0,
        sentAt: null,
        failedAt: null,
        lastAttemptAt: null,
        errorCode: null,
        errorMessage: null,
      },
    });
  });

  it('uploads profile and business card images, then links media files', async () => {
    const profileFile = {
      buffer: Buffer.from('profile'),
      mimetype: 'image/png',
      originalname: 'profile.png',
      size: 7,
    };
    const frontFile = {
      buffer: Buffer.from('front'),
      mimetype: 'image/jpeg',
      originalname: 'front.jpg',
      size: 5,
    };
    const backFile = {
      buffer: Buffer.from('back'),
      mimetype: 'image/jpeg',
      originalname: 'back.jpg',
      size: 4,
    };
    s3Service.uploadFile
      .mockResolvedValueOnce({
        bucket: 'bucket',
        key: 'profiles/profile.png',
        url: 'https://cdn.example.com/profile.png',
        contentType: 'image/png',
        size: 7,
      })
      .mockResolvedValueOnce({
        bucket: 'bucket',
        key: 'cards/front.jpg',
        url: 'https://cdn.example.com/front.jpg',
        contentType: 'image/jpeg',
        size: 5,
      })
      .mockResolvedValueOnce({
        bucket: 'bucket',
        key: 'cards/back.jpg',
        url: 'https://cdn.example.com/back.jpg',
        contentType: 'image/jpeg',
        size: 4,
      });
    const person = {
      id: 'person-1',
      userId: 'user-1',
      name: '홍길동',
      profileImageFileId: 'profile-media-id',
      birthDate: null,
      isImportant: false,
      phoneNumber: '010-1234-5678',
      job: null,
      company: null,
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: false,
      birthdayNotificationOffsetMinutes: 1440,
      createdAt: new Date('2026-06-25T00:00:00.000Z'),
      updatedAt: new Date('2026-06-25T00:00:00.000Z'),
    };
    prisma.person.create.mockResolvedValue(person);
    prisma.mediaFile.create
      .mockResolvedValueOnce({
        id: 'profile-media-id',
        s3Key: 'profiles/profile.png',
      })
      .mockResolvedValueOnce({ id: 'front-media-id' })
      .mockResolvedValueOnce({ id: 'back-media-id' });
    const businessCard = {
      id: 'business-card-1',
      userId: 'user-1',
      personId: 'person-1',
      frontImageFileId: 'front-media-id',
      backImageFileId: 'back-media-id',
      createdAt: new Date('2026-06-25T00:00:00.000Z'),
      updatedAt: new Date('2026-06-25T00:00:00.000Z'),
      frontImageFile: {
        id: 'front-media-id',
        userId: 'user-1',
        type: MediaFileType.IMAGE,
        usage: MediaFileUsage.BUSINESS_CARD_FRONT,
        bucket: 'bucket',
        s3Key: 'cards/front.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 5,
        originalName: 'front.jpg',
        deletedAt: null,
        createdAt: new Date('2026-06-25T00:00:00.000Z'),
        updatedAt: new Date('2026-06-25T00:00:00.000Z'),
      },
      backImageFile: {
        id: 'back-media-id',
        userId: 'user-1',
        type: MediaFileType.IMAGE,
        usage: MediaFileUsage.BUSINESS_CARD_BACK,
        bucket: 'bucket',
        s3Key: 'cards/back.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 4,
        originalName: 'back.jpg',
        deletedAt: null,
        createdAt: new Date('2026-06-25T00:00:00.000Z'),
        updatedAt: new Date('2026-06-25T00:00:00.000Z'),
      },
    };
    prisma.businessCard.create.mockResolvedValue(businessCard);

    await expect(
      service.createPerson(
        'user-1',
        { name: '홍길동', phoneNumber: '010-1234-5678' },
        {
          image: profileFile,
          businessCardFrontImage: frontFile,
          businessCardBackImage: backFile,
        },
      ),
    ).resolves.toEqual({
      ...person,
      image: 'https://signed.example.com/profiles/profile.png',
      extraContacts: [],
      businessCards: [
        {
          id: 'business-card-1',
          frontImageFile: {
            id: 'front-media-id',
            url: 'https://signed.example.com/cards/front.jpg',
          },
          backImageFile: {
            id: 'back-media-id',
            url: 'https://signed.example.com/cards/back.jpg',
          },
        },
      ],
    });

    expect(s3Service.uploadFile).toHaveBeenNthCalledWith(1, {
      body: profileFile.buffer,
      contentType: 'image/png',
      originalName: 'profile.png',
      prefix: 'people/user-1/profiles',
    });
    expect(prisma.mediaFile.create).toHaveBeenNthCalledWith(1, {
      data: {
        userId: 'user-1',
        type: MediaFileType.IMAGE,
        usage: MediaFileUsage.PERSON_PROFILE,
        bucket: 'bucket',
        s3Key: 'profiles/profile.png',
        contentType: 'image/png',
        sizeBytes: 7,
        originalName: 'profile.png',
      },
    });
    expect(prisma.person.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: '홍길동',
        profileImageFileId: 'profile-media-id',
        birthDate: undefined,
        isImportant: false,
        phoneNumber: '010-1234-5678',
        job: undefined,
        company: undefined,
        position: undefined,
        relationship: undefined,
        personality: undefined,
        birthdayNotificationEnabled: false,
        birthdayNotificationOffsetMinutes: 1440,
      },
    });
    expect(prisma.mediaFile.create).toHaveBeenNthCalledWith(2, {
      data: {
        userId: 'user-1',
        type: MediaFileType.IMAGE,
        usage: MediaFileUsage.BUSINESS_CARD_FRONT,
        bucket: 'bucket',
        s3Key: 'cards/front.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 5,
        originalName: 'front.jpg',
      },
    });
    expect(prisma.mediaFile.create).toHaveBeenNthCalledWith(3, {
      data: {
        userId: 'user-1',
        type: MediaFileType.IMAGE,
        usage: MediaFileUsage.BUSINESS_CARD_BACK,
        bucket: 'bucket',
        s3Key: 'cards/back.jpg',
        contentType: 'image/jpeg',
        sizeBytes: 4,
        originalName: 'back.jpg',
      },
    });
    expect(prisma.businessCard.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        personId: 'person-1',
        frontImageFileId: 'front-media-id',
        backImageFileId: 'back-media-id',
      },
      include: {
        frontImageFile: true,
        backImageFile: true,
      },
    });
  });

  it('creates extra contacts for each person in the same transaction', async () => {
    const person = {
      id: 'person-1',
      userId: 'user-1',
      name: '홍길동',
      profileImageFileId: null,
      birthDate: null,
      isImportant: false,
      phoneNumber: '010-1234-5678',
      job: null,
      company: null,
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: false,
      birthdayNotificationOffsetMinutes: 1,
      createdAt: new Date('2026-06-25T00:00:00.000Z'),
      updatedAt: new Date('2026-06-25T00:00:00.000Z'),
    };
    const emailContact = {
      id: 'extra-contact-1',
      type: 'email',
      content: 'user@example.com',
    };
    const instagramContact = {
      id: 'extra-contact-2',
      type: 'instagram',
      content: '@hong',
    };
    prisma.person.create.mockResolvedValue(person);
    prisma.extraContact.create
      .mockResolvedValueOnce(emailContact)
      .mockResolvedValueOnce(instagramContact);

    await expect(
      service.createPerson(
        'user-1',
        {
          name: '홍길동',
          phoneNumber: '010-1234-5678',
          extraContacts: [
            {
              type: 'email',
              content: 'user@example.com',
            },
            {
              type: 'instagram',
              content: '@hong',
            },
          ],
        },
        {},
      ),
    ).resolves.toEqual({
      ...person,
      image: null,
      extraContacts: [emailContact, instagramContact],
      businessCards: [],
    });

    expect(prisma.extraContact.create).toHaveBeenNthCalledWith(1, {
      data: {
        userId: 'user-1',
        personId: 'person-1',
        type: 'email',
        content: 'user@example.com',
      },
      select: {
        id: true,
        type: true,
        content: true,
      },
    });
    expect(prisma.extraContact.create).toHaveBeenNthCalledWith(2, {
      data: {
        userId: 'user-1',
        personId: 'person-1',
        type: 'instagram',
        content: '@hong',
      },
      select: {
        id: true,
        type: true,
        content: true,
      },
    });
  });

  it('rejects duplicate phone numbers for single person creation before uploading files', async () => {
    prisma.person.findFirst.mockResolvedValue({ id: 'person-existing' });

    await expect(
      service.createPerson(
        'user-1',
        {
          name: '홍길동',
          phoneNumber: '010-1234-5678',
        },
        {
          image: {
            buffer: Buffer.from('profile'),
            mimetype: 'image/png',
            originalname: 'profile.png',
            size: 7,
          },
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'PERSON_PHONE_NUMBER_ALREADY_EXISTS',
        message: '이미 등록된 전화번호입니다.',
        phoneNumber: '010-1234-5678',
      },
    });

    await expect(
      service.createPerson(
        'user-1',
        {
          name: '홍길동',
          phoneNumber: '010-1234-5678',
        },
        {},
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.person.findFirst).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        phoneNumber: '010-1234-5678',
      },
      select: {
        id: true,
      },
    });
    expect(s3Service.uploadFile).not.toHaveBeenCalled();
    expect(prisma.person.create).not.toHaveBeenCalled();
  });

  it('deletes uploaded S3 files when database creation fails', async () => {
    s3Service.uploadFile.mockResolvedValueOnce({
      bucket: 'bucket',
      key: 'profiles/profile.png',
      url: 'https://cdn.example.com/profile.png',
      contentType: 'image/png',
      size: 7,
    });
    prisma.person.create.mockRejectedValue(new Error('database failed'));

    await expect(
      service.createPerson(
        'user-1',
        { name: '홍길동', phoneNumber: '010-1234-5678' },
        {
          image: {
            buffer: Buffer.from('profile'),
            mimetype: 'image/png',
            originalname: 'profile.png',
            size: 7,
          },
        },
      ),
    ).rejects.toThrow('database failed');

    expect(s3Service.deleteFile).toHaveBeenCalledWith('profiles/profile.png');
  });
});
