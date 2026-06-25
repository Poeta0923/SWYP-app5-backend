import {
  MediaFileType,
  MediaFileUsage,
  Prisma,
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
    findMany: jest.Mock;
  };
  mediaFile: {
    create: jest.Mock;
  };
  businessCard: {
    create: jest.Mock;
  };
  extraContact: {
    create: jest.Mock;
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
    getSignedUrl: jest.Mock;
  };
  let service: PeopleService;

  beforeEach(() => {
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
        findMany: jest.fn(),
      },
      mediaFile: {
        create: jest.fn(),
      },
      businessCard: {
        create: jest.fn(),
      },
      extraContact: {
        create: jest.fn(),
      },
    };
    s3Service = {
      uploadFile: jest.fn(),
      deleteFile: jest.fn().mockResolvedValue(undefined),
      getSignedUrl: jest.fn(
        (key: string) => `https://signed.example.com/${key}`,
      ),
    };
    service = new PeopleService(
      prisma as unknown as PrismaService,
      s3Service as unknown as S3Service,
    );
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
        profileImageFile: {
          s3Key: 'profiles/profile.png',
        },
      },
      {
        id: 'person-2',
        name: '김영희',
        phoneNumber: null,
        isImportant: false,
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
      },
      {
        id: 'person-2',
        name: '김영희',
        phoneNumber: null,
        image: null,
        isImportant: false,
      },
    ]);

    expect(prisma.person.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        isImportant: true,
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

  it('creates people in one transaction and stores missing category names', async () => {
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
      scheduleNotificationEnabled: false,
      createdAt: new Date('2026-06-25T00:00:00.000Z'),
      updatedAt: new Date('2026-06-25T00:00:00.000Z'),
    };
    const secondPerson = {
      ...firstPerson,
      id: 'person-2',
      name: '김영희',
      birthDate: null,
      isImportant: false,
      phoneNumber: null,
      job: null,
      company: '카카오',
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: false,
      scheduleNotificationEnabled: true,
    };
    prisma.person.create
      .mockResolvedValueOnce(firstPerson)
      .mockResolvedValueOnce(secondPerson);

    await expect(
      service.createPeople(
        'user-1',
        [
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
            scheduleNotificationEnabled: false,
          },
          {
            name: '김영희',
            company: '카카오',
            scheduleNotificationEnabled: true,
          },
        ],
        new Map(),
      ),
    ).resolves.toEqual([
      {
        ...firstPerson,
        birthDate: '1990-01-01',
        image: null,
        extraContacts: [],
        businessCards: [],
      },
      {
        ...secondPerson,
        image: null,
        extraContacts: [],
        businessCards: [],
      },
    ]);

    expect(prisma.job.createMany).toHaveBeenCalledWith({
      data: [{ userId: 'user-1', name: '개발/IT' }],
      skipDuplicates: true,
    });
    expect(prisma.company.createMany).toHaveBeenCalledWith({
      data: [
        { userId: 'user-1', name: '토스' },
        { userId: 'user-1', name: '카카오' },
      ],
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
    expect(prisma.person.create).toHaveBeenNthCalledWith(1, {
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
        scheduleNotificationEnabled: false,
      },
    });
    expect(prisma.person.create).toHaveBeenNthCalledWith(2, {
      data: {
        userId: 'user-1',
        name: '김영희',
        profileImageFileId: undefined,
        birthDate: undefined,
        isImportant: false,
        phoneNumber: undefined,
        job: undefined,
        company: '카카오',
        position: undefined,
        relationship: undefined,
        personality: undefined,
        birthdayNotificationEnabled: false,
        scheduleNotificationEnabled: true,
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
      phoneNumber: null,
      job: null,
      company: null,
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: false,
      scheduleNotificationEnabled: false,
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
      service.createPeople(
        'user-1',
        [{ name: '홍길동' }],
        new Map([
          [
            0,
            {
              image: profileFile,
              businessCardFrontImage: frontFile,
              businessCardBackImage: backFile,
            },
          ],
        ]),
      ),
    ).resolves.toEqual([
      {
        ...person,
        image: 'https://signed.example.com/profiles/profile.png',
        extraContacts: [],
        businessCards: [
          {
            id: 'business-card-1',
            frontImageFile: {
              id: 'front-media-id',
              url: 'https://signed.example.com/cards/front.jpg',
              type: MediaFileType.IMAGE,
              usage: MediaFileUsage.BUSINESS_CARD_FRONT,
              bucket: 'bucket',
              s3Key: 'cards/front.jpg',
              contentType: 'image/jpeg',
              sizeBytes: 5,
              originalName: 'front.jpg',
            },
            backImageFile: {
              id: 'back-media-id',
              url: 'https://signed.example.com/cards/back.jpg',
              type: MediaFileType.IMAGE,
              usage: MediaFileUsage.BUSINESS_CARD_BACK,
              bucket: 'bucket',
              s3Key: 'cards/back.jpg',
              contentType: 'image/jpeg',
              sizeBytes: 4,
              originalName: 'back.jpg',
            },
          },
        ],
      },
    ]);

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
        phoneNumber: undefined,
        job: undefined,
        company: undefined,
        position: undefined,
        relationship: undefined,
        personality: undefined,
        birthdayNotificationEnabled: false,
        scheduleNotificationEnabled: false,
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
      phoneNumber: null,
      job: null,
      company: null,
      position: null,
      relationship: null,
      personality: null,
      birthdayNotificationEnabled: false,
      scheduleNotificationEnabled: false,
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
      service.createPeople(
        'user-1',
        [
          {
            name: '홍길동',
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
        ],
        new Map(),
      ),
    ).resolves.toEqual([
      {
        ...person,
        image: null,
        extraContacts: [emailContact, instagramContact],
        businessCards: [],
      },
    ]);

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
      service.createPeople(
        'user-1',
        [{ name: '홍길동' }],
        new Map([
          [
            0,
            {
              image: {
                buffer: Buffer.from('profile'),
                mimetype: 'image/png',
                originalname: 'profile.png',
                size: 7,
              },
            },
          ],
        ]),
      ),
    ).rejects.toThrow('database failed');

    expect(s3Service.deleteFile).toHaveBeenCalledWith('profiles/profile.png');
  });
});
