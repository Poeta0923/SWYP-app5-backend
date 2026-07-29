import { Module } from '@nestjs/common';
import { AgreementsModule } from '../agreements/agreements.module';
import { PlansModule } from '../plans/plans.module';
import { S3Module } from '../s3/s3.module';
import { AudioDownsampleService } from './audio-downsample.service';
import { GoogleSpeechTranscriptionService } from './google-speech-transcription.service';
import { OpenAISummaryService } from './openai-summary.service';
import { OpenAITranscriptionService } from './openai-transcription.service';
import { RecordController } from './record.controller';
import { RecordService } from './record.service';
import { VoiceSttJobService } from './voice-stt-job.service';

@Module({
  imports: [AgreementsModule, S3Module, PlansModule],
  controllers: [RecordController],
  providers: [
    RecordService,
    OpenAITranscriptionService,
    GoogleSpeechTranscriptionService,
    OpenAISummaryService,
    AudioDownsampleService,
    VoiceSttJobService,
  ],
})
export class RecordModule {}
