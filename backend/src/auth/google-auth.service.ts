import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleUserProfile {
  providerAccountId: string;
  email?: string;
  name: string;
  image?: string;
}

@Injectable()
export class GoogleAuthService {
  private readonly client = new OAuth2Client();

  constructor(private readonly configService: ConfigService) {}

  async verifyIdToken(idToken: string): Promise<GoogleUserProfile> {
    try {
      // 모바일 앱이 넘긴 ID Token의 서명과 audience를 Google 공식 client로 검증한다.
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.getAllowedClientIds(),
      });
      const payload = ticket.getPayload();

      if (!payload?.sub) {
        throw new UnauthorizedException('Invalid Google ID token.');
      }

      if (payload.email && payload.email_verified === false) {
        throw new UnauthorizedException('Google email is not verified.');
      }

      return {
        providerAccountId: payload.sub,
        email: payload.email,
        name: payload.name ?? payload.email ?? 'Google User',
        image: payload.picture,
      };
    } catch (error) {
      if (
        error instanceof UnauthorizedException ||
        error instanceof InternalServerErrorException
      ) {
        throw error;
      }

      throw new UnauthorizedException('Invalid Google ID token.');
    }
  }

  private getAllowedClientIds(): string[] {
    // iOS/Android/Web client ID를 모두 허용할 수 있도록 복수 env를 지원한다.
    const clientIds = [
      this.configService.get<string>('GOOGLE_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_IOS_CLIENT_ID'),
      this.configService.get<string>('GOOGLE_ANDROID_CLIENT_ID'),
    ].filter((clientId): clientId is string => Boolean(clientId));

    if (clientIds.length === 0) {
      throw new InternalServerErrorException(
        'Google OAuth client ID is not configured.',
      );
    }

    return clientIds;
  }
}
