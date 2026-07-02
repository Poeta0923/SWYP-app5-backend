import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { S3Module } from '../s3/s3.module';
import { OpenAITranscriptionService } from './openai-transcription.service';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';

@Module({
  imports: [AgreementsModule, S3Module],
  controllers: [RecordController],
  providers: [RecordService, OpenAITranscriptionService],
})
export class RecordModule {}
