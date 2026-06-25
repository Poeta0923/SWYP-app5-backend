import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { S3Module } from '../s3/s3.module';
import { PeopleController } from './people.controller';
import { PeopleService } from './people.service';

@Module({
  imports: [AgreementsModule, S3Module],
  controllers: [PeopleController],
  providers: [PeopleService],
})
export class PeopleModule {}
