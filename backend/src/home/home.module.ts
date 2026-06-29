import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { S3Module } from '../s3/s3.module';
import { HomeController } from './home.controller';
import { HomeService } from './home.service';

@Module({
  imports: [AgreementsModule, S3Module],
  controllers: [HomeController],
  providers: [HomeService],
})
export class HomeModule {}
