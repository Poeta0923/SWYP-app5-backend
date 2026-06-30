import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserNameDto } from './dto/update-user-name.dto';

export interface UserResponse {
  id: string;
  name: string;
  email: string | null;
  image: string | null;
  role: string;
  isPremium: boolean;
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

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
        isPremium: true,
      },
      limit: 1,
    });

    if (!user[0]) {
      throw new NotFoundException({
        code: 'USER_NOT_FOUND',
        message: '사용자를 찾을 수 없습니다.',
      });
    }

    return user[0];
  }
}
