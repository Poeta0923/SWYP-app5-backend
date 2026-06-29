import { RequestMethod } from '@nestjs/common';
import {
  GUARDS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

describe('HomeController', () => {
  let homeService: {
    getHome: jest.Mock;
  };
  let controller: HomeController;

  beforeEach(() => {
    homeService = {
      getHome: jest.fn().mockResolvedValue({
        schedules: [],
        people: [],
        records: [],
      }),
    };
    controller = new HomeController(homeService as unknown as HomeService);
  });

  it('registers GET /home behind auth and required agreements guards', async () => {
    const getHomeHandler = Object.getOwnPropertyDescriptor(
      HomeController.prototype,
      'getHome',
    )?.value as object;
    const currentUser = {
      sub: 'user-1',
      familyId: 'family-1',
      role: 'USER',
    };

    await expect(controller.getHome(currentUser)).resolves.toEqual({
      schedules: [],
      people: [],
      records: [],
    });

    expect(Reflect.getMetadata(PATH_METADATA, HomeController)).toBe('home');
    expect(Reflect.getMetadata(PATH_METADATA, getHomeHandler)).toBe('/');
    expect(Reflect.getMetadata(METHOD_METADATA, getHomeHandler)).toBe(
      RequestMethod.GET,
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, getHomeHandler)).toEqual([
      JwtAuthGuard,
      RequiredAgreementsGuard,
    ]);
    expect(homeService.getHome).toHaveBeenCalledWith('user-1');
  });
});
