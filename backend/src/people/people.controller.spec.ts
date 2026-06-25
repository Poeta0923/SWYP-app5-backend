import { BadRequestException, RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

describe('PeopleController', () => {
  let peopleService: {
    createPeople: jest.Mock;
    getCategoryNames: jest.Mock;
  };
  let controller: PeopleController;

  beforeEach(() => {
    peopleService = {
      createPeople: jest.fn().mockResolvedValue([]),
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

  it('registers POST /people behind JwtAuthGuard', () => {
    const createPeopleHandler = Object.getOwnPropertyDescriptor(
      PeopleController.prototype,
      'createPeople',
    )?.value as object;

    expect(Reflect.getMetadata(PATH_METADATA, PeopleController)).toBe('people');
    expect(Reflect.getMetadata(PATH_METADATA, createPeopleHandler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, createPeopleHandler)).toBe(
      RequestMethod.POST,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, createPeopleHandler)).toEqual([
      JwtAuthGuard,
    ]);
  });

  it('parses people JSON and maps indexed files to service input', async () => {
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const image = {
      fieldname: 'people[0].image',
      buffer: Buffer.from('image'),
      mimetype: 'image/png',
      originalname: 'profile.png',
      size: 5,
    };
    const businessCardFrontImage = {
      fieldname: 'people[1].businessCardFrontImage',
      buffer: Buffer.from('front'),
      mimetype: 'image/jpeg',
      originalname: 'front.jpg',
      size: 5,
    };

    await expect(
      controller.createPeople(
        currentUser,
        JSON.stringify([
          {
            name: ' 홍길동 ',
            isImportant: 'true',
            birthdayNotificationEnabled: false,
            extraContacts: [
              {
                type: ' email ',
                content: ' user@example.com ',
              },
            ],
          },
          {
            name: '김영희',
            company: '카카오',
            scheduleNotificationEnabled: 'false',
          },
        ]),
        [image, businessCardFrontImage],
      ),
    ).resolves.toEqual([]);

    const createPeopleCalls = peopleService.createPeople.mock
      .calls as Parameters<PeopleService['createPeople']>[];
    const filesByIndex = createPeopleCalls[0][2];
    expect(peopleService.createPeople).toHaveBeenCalledWith(
      'user-1',
      [
        {
          name: '홍길동',
          isImportant: true,
          birthdayNotificationEnabled: false,
          extraContacts: [
            {
              type: 'email',
              content: 'user@example.com',
            },
          ],
        },
        {
          name: '김영희',
          company: '카카오',
          scheduleNotificationEnabled: false,
        },
      ],
      filesByIndex,
    );
    expect(filesByIndex.get(0)?.image).toBe(image);
    expect(filesByIndex.get(1)?.businessCardFrontImage).toBe(
      businessCardFrontImage,
    );
  });

  it('rejects invalid people payloads', () => {
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    expect(() => controller.createPeople(currentUser, undefined, [])).toThrow(
      BadRequestException,
    );
    expect(() => controller.createPeople(currentUser, '{invalid', [])).toThrow(
      BadRequestException,
    );
    expect(() =>
      controller.createPeople(
        currentUser,
        JSON.stringify({ name: '홍길동' }),
        [],
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createPeople(currentUser, JSON.stringify([]), []),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createPeople(
        currentUser,
        JSON.stringify([{ name: '홍길동', unknown: 'field' }]),
        [],
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createPeople(
        currentUser,
        JSON.stringify([
          {
            name: '홍길동',
            extraContacts: [
              {
                type: 'email',
                content: 'user@example.com',
                unknown: 'field',
              },
            ],
          },
        ]),
        [],
      ),
    ).toThrow(BadRequestException);
    expect(peopleService.createPeople).not.toHaveBeenCalled();
  });

  it('rejects file indexes outside the people array and duplicate file fields', () => {
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const image = {
      fieldname: 'people[0].image',
      buffer: Buffer.from('image'),
      mimetype: 'image/png',
      originalname: 'profile.png',
      size: 5,
    };

    expect(() =>
      controller.createPeople(
        currentUser,
        JSON.stringify([{ name: '홍길동' }]),
        [
          {
            ...image,
            fieldname: 'people[1].image',
          },
        ],
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      controller.createPeople(
        currentUser,
        JSON.stringify([{ name: '홍길동' }]),
        [image, image],
      ),
    ).toThrow(BadRequestException);
  });
});
