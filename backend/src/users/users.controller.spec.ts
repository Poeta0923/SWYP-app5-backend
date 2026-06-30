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
    updateName: jest.Mock;
  };
  let controller: UsersController;

  beforeEach(() => {
    usersService = {
      updateName: jest.fn().mockResolvedValue({
        id: 'user-1',
        name: '홍길동',
        email: 'user@example.com',
        image: null,
        role: 'USER',
        isPremium: false,
      }),
    };
    controller = new UsersController(usersService as unknown as UsersService);
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
      isPremium: false,
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
