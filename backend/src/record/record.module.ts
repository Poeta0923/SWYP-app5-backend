import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { S3Module } from '../s3/s3.module';
import { AudioDownsampleService } from './audio-downsample.service';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';
import { VoiceSttJobService } from './voice-stt-job.service';

@Module({
  imports: [AgreementsModule, S3Module],
  controllers: [RecordController],
  providers: [
    RecordService,
    OpenAITranscriptionService,
    OpenAISummaryService,
    AudioDownsampleService,
    VoiceSttJobService,
  ],
})
export class RecordModule {}
