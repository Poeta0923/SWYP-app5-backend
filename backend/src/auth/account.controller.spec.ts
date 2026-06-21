import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { AccountController } from './account.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('AccountController', () => {
  let authService: {
    deleteAccount: jest.Mock;
  };
  let controller: AccountController;

  beforeEach(() => {
    authService = {
      deleteAccount: jest.fn().mockResolvedValue({ success: true }),
    };
    controller = new AccountController(authService as unknown as AuthService);
  });

  it('registers POST /account/delete behind JwtAuthGuard', () => {
    expect(Reflect.getMetadata(PATH_METADATA, AccountController)).toBe(
      'account',
    );
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        AccountController.prototype.deleteAccount,
      ),
    ).toBe('delete');
    expect(
      Reflect.getMetadata(
        METHOD_METADATA,
        AccountController.prototype.deleteAccount,
      ),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        AccountController.prototype.deleteAccount,
      ),
    ).toEqual([JwtAuthGuard]);
  });

  it('passes the authenticated user and Google ID token to AuthService', async () => {
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = {
      idToken: 'google-id-token',
    };

    await expect(controller.deleteAccount(currentUser, dto)).resolves.toEqual({
      success: true,
    });

    expect(authService.deleteAccount).toHaveBeenCalledWith(currentUser, dto);
  });
});
