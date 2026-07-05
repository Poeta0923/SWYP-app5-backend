import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushTokenController } from './push-token.controller';
import { PushTokenService } from './push-token.service';

describe('PushTokenController', () => {
  let pushTokenService: {
    registerPushToken: jest.Mock;
  };
  let controller: PushTokenController;

  beforeEach(() => {
    pushTokenService = {
      registerPushToken: jest.fn().mockResolvedValue({
        id: 'push-token-1',
        platform: 'ANDROID',
        lastSeenAt: '2026-07-05T12:00:00.000Z',
      }),
    };
    controller = new PushTokenController(
      pushTokenService as unknown as PushTokenService,
    );
  });

  it('registers POST /push-tokens behind auth and required agreements guards', async () => {
    const registerPushTokenHandler = Object.getOwnPropertyDescriptor(
      PushTokenController.prototype,
      'registerPushToken',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };
    const dto = {
      token: 'fcm-token',
      platform: 'ANDROID' as const,
    };

    await expect(
      controller.registerPushToken(currentUser, dto),
    ).resolves.toEqual({
      id: 'push-token-1',
      platform: 'ANDROID',
      lastSeenAt: '2026-07-05T12:00:00.000Z',
    });

    expect(Reflect.getMetadata(PATH_METADATA, PushTokenController)).toBe(
      'push-tokens',
    );
    expect(Reflect.getMetadata(PATH_METADATA, registerPushTokenHandler)).toBe(
      '/',
    );
    expect(
      Reflect.getMetadata(METHOD_METADATA, registerPushTokenHandler),
    ).toBe(RequestMethod.POST);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, registerPushTokenHandler),
    ).toEqual([JwtAuthGuard, RequiredAgreementsGuard]);
    expect(pushTokenService.registerPushToken).toHaveBeenCalledWith(
      'user-1',
      dto,
    );
  });
});
