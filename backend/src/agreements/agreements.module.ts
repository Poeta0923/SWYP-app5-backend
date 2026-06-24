import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';
import { RequiredAgreementsGuard } from './required-agreements.guard';

@Module({
  imports: [PrismaModule, AuthCoreModule],
  controllers: [AgreementsController],
  providers: [AgreementsService, RequiredAgreementsGuard],
  exports: [AgreementsService, RequiredAgreementsGuard],
})
export class AgreementsModule {}
