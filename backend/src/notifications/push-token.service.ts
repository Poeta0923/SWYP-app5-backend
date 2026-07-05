import { Injectable } from '@nestjs/common';
import type { PushPlatform } from '../../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RegisterPushTokenDto } from './dto/register-push-token.dto';

export interface PushTokenResponse {
  id: string;
  platform: PushPlatform | null;
  lastSeenAt: string;
}

@Injectable()
export class PushTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async registerPushToken(
    userId: string,
    item: RegisterPushTokenDto,
  ): Promise<PushTokenResponse> {
    const now = new Date();
    const pushToken = await this.prisma.pushToken.upsert({
      where: {
        token: item.token,
      },
      create: {
        userId,
        token: item.token,
        platform: item.platform ?? null,
        revokedAt: null,
        lastSeenAt: now,
      },
      update: {
        userId,
        ...(item.platform !== undefined ? { platform: item.platform } : {}),
        revokedAt: null,
        lastSeenAt: now,
      },
      select: {
        id: true,
        platform: true,
        lastSeenAt: true,
      },
    });

    return {
      id: pushToken.id,
      platform: pushToken.platform,
      lastSeenAt: pushToken.lastSeenAt?.toISOString() ?? now.toISOString(),
    };
  }
}
