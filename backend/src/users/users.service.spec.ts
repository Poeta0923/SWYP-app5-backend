import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

interface PrismaMock {
  user: {
    updateManyAndReturn: jest.Mock;
  };
}

describe('UsersService', () => {
  let prisma: PrismaMock;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        updateManyAndReturn: jest.fn(),
      },
    };
    service = new UsersService(prisma as unknown as PrismaService);
  });

  it('updates the current user name and returns public user fields', async () => {
    prisma.user.updateManyAndReturn.mockResolvedValue([
      {
        id: 'user-1',
        name: '홍길동',
        email: 'user@example.com',
        image: null,
        role: 'USER',
        isPremium: false,
      },
    ]);

    await expect(
      service.updateName('user-1', { name: '홍길동' }),
    ).resolves.toEqual({
      id: 'user-1',
      name: '홍길동',
      email: 'user@example.com',
      image: null,
      role: 'USER',
      isPremium: false,
    });

    expect(prisma.user.updateManyAndReturn).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
      },
      data: {
        name: '홍길동',
      },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
        isPremium: true,
      },
      limit: 1,
    });
  });

  it('throws NotFoundException when the user does not exist', async () => {
    prisma.user.updateManyAndReturn.mockResolvedValue([]);

    await expect(
      service.updateName('missing-user', { name: '홍길동' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
