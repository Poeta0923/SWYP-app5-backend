import { BadRequestException, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ImportPeopleDto } from './dto/import-people.dto';
import { UpdatePersonItemDto } from './dto/update-person-item.dto';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

describe('PeopleController', () => {
  let peopleService: {
    createPerson: jest.Mock;
    importPeople: jest.Mock;
    getPeople: jest.Mock;
    getPerson: jest.Mock;
    updatePerson: jest.Mock;
    addPersonProfileImage: jest.Mock;
    updatePersonProfileImage: jest.Mock;
    deletePersonProfileImage: jest.Mock;
    deletePerson: jest.Mock;
    getCategoryNames: jest.Mock;
  };
  let controller: PeopleController;

  beforeEach(() => {
    peopleService = {
      createPerson: jest.fn().mockResolvedValue({}),
      importPeople: jest.fn().mockResolvedValue([]),
      getPeople: jest.fn().mockResolvedValue([]),
      getPerson: jest.fn().mockResolvedValue({}),
      updatePerson: jest.fn().mockResolvedValue({}),
      addPersonProfileImage: jest.fn().mockResolvedValue({}),
      updatePersonProfileImage: jest.fn().mockResolvedValue({}),
      deletePersonProfileImage: jest.fn().mockResolvedValue({}),
      deletePerson: jest.fn().mockResolvedValue({ success: true }),
      getCategoryNames: jest.fn().mockResolvedValue({
        jobs: [],
        companies: [],
        positions: [],
        relationships: [],
      }),
    };
    controller = new PeopleController(
      peopleService as unknown as PeopleService,
    );
  });

  it('registers POST /people behind auth and required agreements guards', () => {
    const createPersonHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'createPerson',
    )?.value as object;

    expect(Reflect.getMetadata(PATH_METADATA, PeopleController)).toBe('people');
    expect(Reflect.getMetadata(PATH_METADATA, createPersonHandler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, createPersonHandler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, createPersonHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
  });

  it('registers POST /people/import behind auth and required agreements guards and imports contacts', async () => {
    const importPeopleHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'importPeople',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = plainToInstance(ImportPeopleDto, {
      people: [
        {
          name: ' 홍길동 ',
          phoneNumber: ' 010-1234-5678 ',
        },
        {
          name: '김영희',
          phoneNumber: '010-1234-5678',
        },
      ],
    });

    await expect(controller.importPeople(currentUser, dto)).resolves.toEqual(
      [],
    );

    expect(Reflect.getMetadata(PATH_METADATA, importPeopleHandler)).toBe(
      'import',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, importPeopleHandler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, importPeopleHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(peopleService.importPeople).toHaveBeenCalledWith('user-1', [
      {
        name: '홍길동',
        phoneNumber: '010-1234-5678',
      },
      {
        name: '김영희',
        phoneNumber: '010-1234-5678',
      },
    ]);
  });

  it('registers GET /people behind auth and required agreements guards and fetches current user people', async () => {
    const getPeopleHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'getPeople',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(controller.getPeople(currentUser)).resolves.toEqual([]);

    expect(Reflect.getMetadata(PATH_METADATA, getPeopleHandler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, getPeopleHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getPeopleHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(peopleService.getPeople).toHaveBeenCalledWith('user-1');
  });

  it('registers GET /people/:personId behind auth and required agreements guards and fetches one person', async () => {
    const getPersonHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'getPerson',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(
      controller.getPerson(currentUser, 'person-1'),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, getPersonHandler)).toBe(
      ':personId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, getPersonHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getPersonHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(peopleService.getPerson).toHaveBeenCalledWith('user-1', 'person-1');
  });

  it('registers PATCH /people/:personId behind auth and required agreements guards and updates one person', async () => {
    const updatePersonHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'updatePerson',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = plainToInstance(UpdatePersonItemDto, {
      name: ' 홍길동 ',
      company: ' 토스 ',
      extraContacts: [],
    });

    await expect(
      controller.updatePerson(currentUser, 'person-1', dto),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, updatePersonHandler)).toBe(
      ':personId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, updatePersonHandler)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, updatePersonHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(peopleService.updatePerson).toHaveBeenCalledWith(
      'user-1',
      'person-1',
      {
        name: '홍길동',
        company: '토스',
        extraContacts: [],
      },
    );
  });

  it('registers POST /people/:personId/profile-image and adds one profile image', async () => {
    const addProfileImageHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'addPersonProfileImage',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const image = {
      fieldname: 'image',
      buffer: Buffer.from('image'),
      mimetype: 'image/png',
      originalname: 'profile.png',
      size: 5,
    };

    await expect(
      controller.addPersonProfileImage(currentUser, 'person-1', image),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, addProfileImageHandler)).toBe(
      ':personId/profile-image',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, addProfileImageHandler)).toBe(
      RequestMethod.POST,
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, addProfileImageHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(peopleService.addPersonProfileImage).toHaveBeenCalledWith(
      'user-1',
      'person-1',
      image,
    );
  });

  it('registers PATCH /people/:personId/profile-image and updates one profile image', async () => {
    const updateProfileImageHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'updatePersonProfileImage',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const image = {
      fieldname: 'image',
      buffer: Buffer.from('image'),
      mimetype: 'image/png',
      originalname: 'profile.png',
      size: 5,
    };

    await expect(
      controller.updatePersonProfileImage(currentUser, 'person-1', image),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, updateProfileImageHandler)).toBe(
      ':personId/profile-image',
    );
    expect(
      Reflect.getMetadata(METHOD_METADATA, updateProfileImageHandler),
    ).toBe(RequestMethod.PATCH);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, updateProfileImageHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(peopleService.updatePersonProfileImage).toHaveBeenCalledWith(
      'user-1',
      'person-1',
      image,
    );
  });

  it('registers DELETE /people/:personId/profile-image and deletes one profile image', async () => {
    const deleteProfileImageHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'deletePersonProfileImage',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(
      controller.deletePersonProfileImage(currentUser, 'person-1'),
    ).resolves.toEqual({});

    expect(Reflect.getMetadata(PATH_METADATA, deleteProfileImageHandler)).toBe(
      ':personId/profile-image',
    );
    expect(
      Reflect.getMetadata(METHOD_METADATA, deleteProfileImageHandler),
    ).toBe(RequestMethod.DELETE);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, deleteProfileImageHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(peopleService.deletePersonProfileImage).toHaveBeenCalledWith(
      'user-1',
      'person-1',
    );
  });

  it('registers DELETE /people/:personId and deletes one person', async () => {
    const deletePersonHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'deletePerson',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(
      controller.deletePerson(currentUser, 'person-1'),
    ).resolves.toEqual({ success: true });

    expect(Reflect.getMetadata(PATH_METADATA, deletePersonHandler)).toBe(
      ':personId',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, deletePersonHandler)).toBe(
      RequestMethod.DELETE,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, deletePersonHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(peopleService.deletePerson).toHaveBeenCalledWith(
      'user-1',
      'person-1',
    );
  });

  it('parses person JSON and maps files to service input', async () => {
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const image = {
      fieldname: 'image',
      buffer: Buffer.from('image'),
      mimetype: 'image/png',
      originalname: 'profile.png',
      size: 5,
    };
    const businessCardFrontImage = {
      fieldname: 'businessCardFrontImage',
      buffer: Buffer.from('front'),
      mimetype: 'image/jpeg',
      originalname: 'front.jpg',
      size: 5,
    };

    await expect(
      controller.createPerson(
        currentUser,
        JSON.stringify({
          name: ' 홍길동 ',
          phoneNumber: ' 010-1234-5678 ',
          isImportant: 'true',
          birthdayNotificationEnabled: 'true',
          birthdayNotificationOffsetDays: '1',
          extraContacts: [
            {
              type: ' email ',
              content: ' user@example.com ',
            },
          ],
        }),
        [image, businessCardFrontImage],
      ),
    ).resolves.toEqual({});

    const createPersonCalls = peopleService.createPerson.mock
      .calls as Parameters<PeopleService['createPerson']>[];
    const personFiles = createPersonCalls[0][2];
    expect(peopleService.createPerson).toHaveBeenCalledWith(
      'user-1',
      {
        name: '홍길동',
        phoneNumber: '010-1234-5678',
        isImportant: true,
        birthdayNotificationEnabled: true,
        birthdayNotificationOffsetDays: 1,
        extraContacts: [
          {
            type: 'email',
            content: 'user@example.com',
          },
        ],
      },
      personFiles,
    );
    expect(personFiles.image).toBe(image);
    expect(personFiles.businessCardFrontImage).toBe(businessCardFrontImage);
  });

  it('rejects invalid person payloads', () => {
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    expect(() => controller.createPerson(currentUser, undefined, [])).toThrow(
      BadRequestException,
    );
    expect(() => controller.createPerson(currentUser, '{invalid', [])).toThrow(
      BadRequestException,
    );
    expect(() =>
      controller.createPerson(
        currentUser,
        JSON.stringify([{ name: '홍길동', phoneNumber: '010-1234-5678' }]),
        [],
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createPerson(
        currentUser,
        JSON.stringify({ name: '홍길동' }),
        [],
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createPerson(
        currentUser,
        JSON.stringify({
          name: '홍길동',
          phoneNumber: '010-1234-5678',
          unknown: 'field',
        }),
        [],
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createPerson(
        currentUser,
        JSON.stringify({
          name: '홍길동',
          phoneNumber: '010-1234-5678',
          birthdayNotificationEnabled: true,
          birthdayNotificationOffsetDays: -1,
        }),
        [],
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createPerson(
        currentUser,
        JSON.stringify({
          name: '홍길동',
          phoneNumber: '010-1234-5678',
          extraContacts: [
            {
              type: 'email',
              content: 'user@example.com',
              unknown: 'field',
            },
          ],
        }),
        [],
      ),
    ).toThrow(BadRequestException);
    expect(peopleService.createPerson).not.toHaveBeenCalled();
  });

  it('rejects invalid file fields and duplicate file fields', () => {
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const image = {
      fieldname: 'image',
      buffer: Buffer.from('image'),
      mimetype: 'image/png',
      originalname: 'profile.png',
      size: 5,
    };

    expect(() =>
      controller.createPerson(
        currentUser,
        JSON.stringify({ name: '홍길동', phoneNumber: '010-1234-5678' }),
        [
          {
            ...image,
            fieldname: 'people[0].image',
          },
        ],
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createPerson(
        currentUser,
        JSON.stringify({ name: '홍길동', phoneNumber: '010-1234-5678' }),
        [image, image],
      ),
    ).toThrow(BadRequestException);
  });

  it('requires a profile image file for profile image create and update', () => {
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    expect(() =>
      controller.addPersonProfileImage(currentUser, 'person-1', undefined),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.updatePersonProfileImage(currentUser, 'person-1', undefined),
    ).toThrow(BadRequestException);
    expect(peopleService.addPersonProfileImage).not.toHaveBeenCalled();
    expect(peopleService.updatePersonProfileImage).not.toHaveBeenCalled();
  });

  it('validates import people payloads', () => {
    const validDto = plainToInstance(ImportPeopleDto, {
      people: [
        {
          name: ' 홍길동 ',
          phoneNumber: ' 010-1234-5678 ',
        },
      ],
    });
    expect(
      validateSync(validDto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toEqual([]);
    expect(validDto.people).toEqual([
      {
        name: '홍길동',
        phoneNumber: '010-1234-5678',
      },
    ]);

    const invalidPayloads = [
      {},
      { people: [] },
      { people: [{ phoneNumber: '010-1234-5678' }] },
      { people: [{ name: '홍길동' }] },
      { people: [{ name: '', phoneNumber: '010-1234-5678' }] },
      { people: [{ name: '홍길동', phoneNumber: '' }] },
      {
        people: [
          {
            name: '홍길동',
            phoneNumber: '010-1234-5678',
            unknown: 'field',
          },
        ],
      },
    ];

    for (const payload of invalidPayloads) {
      const dto = plainToInstance(ImportPeopleDto, payload);

      expect(
        validateSync(dto, {
          whitelist: true,
          forbidNonWhitelisted: true,
        }).length,
      ).toBeGreaterThan(0);
    }
  });

  it('validates update person payloads and rejects image fields', () => {
    const validDto = plainToInstance(UpdatePersonItemDto, {
      name: ' 홍길동 ',
      birthDate: '',
      isImportant: 'true',
      phoneNumber: ' 010-1234-5678 ',
      job: '',
      birthdayNotificationOffsetDays: '1',
      extraContacts: [
        {
          type: ' email ',
          content: ' user@example.com ',
        },
      ],
    });

    expect(
      validateSync(validDto, {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    ).toEqual([]);
    expect(validDto).toEqual({
      name: '홍길동',
      birthDate: null,
      isImportant: true,
      phoneNumber: '010-1234-5678',
      job: null,
      birthdayNotificationOffsetDays: 1,
      extraContacts: [
        {
          type: 'email',
          content: 'user@example.com',
        },
      ],
    });

    const invalidPayloads = [
      { name: '' },
      { name: null },
      { phoneNumber: '' },
      { phoneNumber: null },
      { isImportant: null },
      { birthdayNotificationEnabled: null },
      { birthdayNotificationOffsetDays: -1 },
      { extraContacts: null },
      { extraContacts: [{ type: 'email' }] },
      { image: 'https://example.com/profile.png' },
      { businessCards: [] },
      { businessCardFrontImage: 'https://example.com/front.png' },
    ];

    for (const payload of invalidPayloads) {
      const dto = plainToInstance(UpdatePersonItemDto, payload);

      expect(
        validateSync(dto, {
          whitelist: true,
          forbidNonWhitelisted: true,
        }).length,
      ).toBeGreaterThan(0);
    }
  });
});
