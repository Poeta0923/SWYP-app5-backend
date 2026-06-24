import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AgreementsService } from './agreements.service';
import { RequiredAgreementsGuard } from './required-agreements.guard';

describe('RequiredAgreementsGuard', () => {
  let agreementsService: {
    hasAgreedAllRequiredAgreements: jest.Mock;
  };
  let guard: RequiredAgreementsGuard;

  const createContext = (user?: { sub: string }): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          user,
        }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    agreementsService = {
      hasAgreedAllRequiredAgreements: jest.fn(),
    };
    guard = new RequiredAgreementsGuard(
      agreementsService as unknown as AgreementsService,
    );
  });

  it('allows the request when the user agreed to all required agreements', async () => {
    agreementsService.hasAgreedAllRequiredAgreements.mockResolvedValue(true);

    await expect(
      guard.canActivate(createContext({ sub: 'user-1' })),
    ).resolves.toBe(true);

    expect(
      agreementsService.hasAgreedAllRequiredAgreements,
    ).toHaveBeenCalledWith('user-1');
  });

  it('rejects the request when there is no authenticated user', async () => {
    await expect(guard.canActivate(createContext())).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(
      agreementsService.hasAgreedAllRequiredAgreements,
    ).not.toHaveBeenCalled();
  });

  it('rejects the request when required agreements are missing', async () => {
    agreementsService.hasAgreedAllRequiredAgreements.mockResolvedValue(false);

    await expect(
      guard.canActivate(createContext({ sub: 'user-1' })),
    ).rejects.toMatchObject({
      response: {
        code: 'REQUIRED_AGREEMENTS_NOT_ACCEPTED',
      },
    });
  });
});
