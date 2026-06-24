import { Module } from '@nestjs/common';
import { AuthCoreModule } from '../auth/auth-core.module';
import { PrismaModule } from '../prisma/prisma.module';
import { AgreementsController } from './agreements.controller';
import { AgreementsService } from './agreements.service';

@Module({
  imports: [PrismaModule, AuthCoreModule],
  controllers: [AgreementsController],
  providers: [AgreementsService],
  exports: [AgreementsService],
})
export class AgreementsModule {}
