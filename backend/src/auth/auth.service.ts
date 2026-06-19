import { Injectable } from '@nestjs/common';
import { GoogleAuthService } from './google-auth.service';
import { SessionService } from './session.service';
import { TokenService } from './token.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly googleAuthService: GoogleAuthService,
    private readonly sessionService: SessionService,
    private readonly tokenService: TokenService,
  ) {}
}
