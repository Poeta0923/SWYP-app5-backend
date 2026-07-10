import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

interface PrismaMock {
  user: {
    findUnique: jest.Mock;
    updateManyAndReturn: jest.Mock;
  };
  mediaFile: {
    aggregate: jest.Mock;
  };
}

describe('UsersService', () => {
  let prisma: PrismaMock;
  let service: UsersService;

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn(),
        updateManyAndReturn: jest.fn(),
      },
      mediaFile: {
        aggregate: jest.fn(),
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
        plan: 'Basic',
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
      plan: 'Basic',
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
        plan: true,
      },
      limit: 1,
    });
  });

  it('returns my page user fields and VOICE record media size in MB', async () => {
    prisma.user.findUnique.mockResolvedValue({
      name: '홍길동',
      email: 'user@example.com',
    });
    prisma.mediaFile.aggregate.mockResolvedValue({
      _sum: {
        sizeBytes: 1.5 * 1024 * 1024,
      },
    });

    await expect(service.getMyPage('user-1')).resolves.toEqual({
      user: {
        name: '홍길동',
        email: 'user@example.com',
      },
      voiceRecordMediaSizeMb: 1.5,
    });

    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        id: 'user-1',
      },
      select: {
        name: true,
        email: true,
      },
    });
    expect(prisma.mediaFile.aggregate).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        usage: 'RECORD_VOICE',
        recordVoice: {
          is: {
            userId: 'user-1',
            type: 'VOICE',
          },
        },
      },
      _sum: {
        sizeBytes: true,
      },
    });
  });

  it('returns 0 MB when the current user has no VOICE media files', async () => {
    prisma.user.findUnique.mockResolvedValue({
      name: '홍길동',
      email: null,
    });
    prisma.mediaFile.aggregate.mockResolvedValue({
      _sum: {
        sizeBytes: null,
      },
    });

    await expect(service.getMyPage('user-1')).resolves.toEqual({
      user: {
        name: '홍길동',
        email: null,
      },
      voiceRecordMediaSizeMb: 0,
    });
  });

  it('throws NotFoundException when the user does not exist', async () => {
    prisma.user.updateManyAndReturn.mockResolvedValue([]);

    await expect(
      service.updateName('missing-user', { name: '홍길동' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('throws NotFoundException when my page user does not exist', async () => {
    prisma.user.findUnique.mockResolvedValue(null);

    await expect(service.getMyPage('missing-user')).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.mediaFile.aggregate).not.toHaveBeenCalled();
  });
});
