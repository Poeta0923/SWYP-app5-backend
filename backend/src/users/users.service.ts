import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import {
  MediaFileUsage,
  RecordType,
  type UserPlan,
} from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PiiCryptoService } from '../privacy/pii-crypto.service';
import { UpdateUserNameDto } from './dto/update-user-name.dto';

const BYTES_PER_MEGABYTE = 1024 * 1024;

export interface UserResponse {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  role: string;
  plan: UserPlan;
}

export interface MyPageUserResponse {
  name: string;
  email: string | null;
}

export interface MyPageResponse {
  user: MyPageUserResponse;
  voiceRecordMediaSizeMb: number;
}

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    private readonly piiCryptoService: PiiCryptoService = new PiiCryptoService(),
  ) {}

  async updateName(
    userId: string,
    dto: UpdateUserNameDto,
  ): Promise<UserResponse> {
    const user = await this.prisma.user.updateManyAndReturn({
      where: {
        id: userId,
      },
      data: {
        name: dto.name,
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

    if (!user[0]) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다.',
      });
    }

    return {
      ...user[0],
      email: this.piiCryptoService.decrypt(user[0].email),
    };
  }

  async getMyPage(userId: string): Promise<MyPageResponse> {
    const user = await this.prisma.user.findUnique({
      where: {
        id: userId,
      },
      select: {
        name: true,
        email: true,
      },
    });

    if (!user) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다.',
      });
    }

    const voiceMediaSize = await this.prisma.mediaFile.aggregate({
      where: {
        userId,
        usage: MediaFileUsage.RECORD_VOICE,
        recordVoice: {
          is: {
            userId,
            type: RecordType.VOICE,
          },
        },
      },
      _sum: {
        sizeBytes: true,
      },
    });

    return {
      user: {
        name: user.name,
        email: this.piiCryptoService.decrypt(user.email),
      },
      voiceRecordMediaSizeMb:
        (voiceMediaSize._sum.sizeBytes ?? 0) / BYTES_PER_MEGABYTE,
    };
  }
}
