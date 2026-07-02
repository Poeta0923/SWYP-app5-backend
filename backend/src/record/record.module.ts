import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { S3Module } from '../s3/s3.module';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';

@Module({
  imports: [AgreementsModule, S3Module],
  controllers: [RecordController],
  providers: [RecordService, OpenAITranscriptionService, OpenAISummaryService],
})
export class RecordModule {}
