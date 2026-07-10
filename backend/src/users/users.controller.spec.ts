import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

describe('UsersController', () => {
  let usersService: {
    getMyPage: jest.Mock;
    updateName: jest.Mock;
  };
  let controller: UsersController;

  beforeEach(() => {
    usersService = {
      getMyPage: jest.fn().mockResolvedValue({
        user: {
          name: '홍길동',
          email: 'user@example.com',
        },
        voiceRecordMediaSizeMb: 1.5,
      }),
      updateName: jest.fn().mockResolvedValue({
        id: 'user-1',
        name: '홍길동',
        email: 'user@example.com',
        image: null,
        role: 'USER',
        plan: 'Basic',
      }),
    };
    controller = new UsersController(usersService as unknown as UsersService);
  });

  it('registers GET /users/me behind auth and required agreements guards', async () => {
    const getMyPageHandler = Object.getOwnPropertyDescriptor(
      UsersController.prototype,
      'getMyPage',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(controller.getMyPage(currentUser)).resolves.toEqual({
      user: {
        name: '홍길동',
        email: 'user@example.com',
      },
      voiceRecordMediaSizeMb: 1.5,
    });

    expect(Reflect.getMetadata(PATH_METADATA, UsersController)).toBe('users');
    expect(Reflect.getMetadata(PATH_METADATA, getMyPageHandler)).toBe('me');
    expect(Reflect.getMetadata(METHOD_METADATA, getMyPageHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getMyPageHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(usersService.getMyPage).toHaveBeenCalledWith('user-1');
  });

  it('registers PATCH /users/me/name behind auth and required agreements guards', async () => {
    const updateMyNameHandler = Object.getOwnPropertyDescriptor(
      UsersController.prototype,
      'updateMyName',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = {
      name: '홍길동',
    };

    await expect(controller.updateMyName(currentUser, dto)).resolves.toEqual({
      id: 'user-1',
      name: '홍길동',
      email: 'user@example.com',
      image: null,
      role: 'USER',
      plan: 'Basic',
    });

    expect(Reflect.getMetadata(PATH_METADATA, UsersController)).toBe('users');
    expect(Reflect.getMetadata(PATH_METADATA, updateMyNameHandler)).toBe(
      'me/name',
    );
    expect(Reflect.getMetadata(METHOD_METADATA, updateMyNameHandler)).toBe(
      RequestMethod.PATCH,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, updateMyNameHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(usersService.updateName).toHaveBeenCalledWith('user-1', dto);
  });
});
