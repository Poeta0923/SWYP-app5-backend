import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { AccountController } from './account.controller';
import { AuthCoreModule } from './auth-core.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { GoogleAuthService } from './google-auth.service';

@Module({
  imports: [AuthCoreModule, AgreementsModule],
  controllers: [AuthController, AccountController],
  providers: [AuthService, GoogleAuthService],
  exports: [AuthService, AuthCoreModule],
})
export class AuthModule {}
