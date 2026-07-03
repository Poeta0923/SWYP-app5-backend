import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadGatewayResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { HomeRecordEntity } from '../home/entities/home.entity';
import { CreateTextRecordDto } from './dto/create-text-record.dto';
import { CreateVoiceRecordSttMultipartDto } from './dto/create-voice-record-stt-multipart.dto';
import { UpdateTextRecordDto } from './dto/update-text-record.dto';
import { UpdateVoiceRecordDto } from './dto/update-voice-record.dto';
import {
  TextRecordDetailEntity,
  TextRecordEntity,
} from './entities/text-record.entity';
import { VoiceRecordDetailEntity } from './entities/voice-record-detail.entity';
import { VoiceRecordSummaryEntity } from './entities/voice-record-summary.entity';
import { VoiceRecordSttEntity } from './entities/voice-record-stt.entity';
import {
  RECORD_MEMO_MAX_LENGTH,
  RECORD_VOICE_FILE_FIELD_NAME,
  RECORD_VOICE_FILE_SIZE_LIMIT_BYTES,
} from './record.constants';
import { RecordService, type VoiceRecordFile } from './record.service';

const RECORD_VOICE_FILE_EXTENSIONS = new Set(['.m4a']);
const RECORD_VOICE_FILE_CONTENT_TYPES = new Set([
  'audio/m4a',
  'audio/mp4',
  'audio/x-m4a',
  'application/octet-stream',
]);

@ApiTags('record')
@Controller('record')
export class RecordController {
  constructor(private readonly recordService: RecordService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '기록 목록 조회',
    description:
      '현재 사용자의 전체 기록 목록을 생성 시각 내림차순으로 조회합니다.',
  })
  @ApiOkResponse({
    description: '기록 목록 조회 성공',
    type: HomeRecordEntity,
    isArray: true,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  getRecords(@CurrentUser() currentUser: JwtAccessPayload) {
    return this.recordService.getRecords(currentUser.sub);
  }

  @Post('voice/stt')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @UseInterceptors(
    FileInterceptor(RECORD_VOICE_FILE_FIELD_NAME, {
      limits: {
        fileSize: RECORD_VOICE_FILE_SIZE_LIMIT_BYTES,
      },
      fileFilter: (_request, file, callback) => {
        if (!isM4aFile(file)) {
          callback(
            new BadRequestException('Only m4a audio files are allowed.'),
            false,
          );
          return;
        }

        callback(null, true);
      },
    }),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '음성 기록 STT 생성',
    description:
      'm4a 음성 파일을 S3에 저장하고 OpenAI STT로 변환한 텍스트를 기록 content에 저장합니다.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreateVoiceRecordSttMultipartDto })
  @ApiCreatedResponse({
    description: '음성 기록 STT 생성 성공',
    type: VoiceRecordSttEntity,
  })
  @ApiBadRequestResponse({
    description: '요청 body 또는 파일 검증 실패',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiBadGatewayResponse({
    description: 'OpenAI STT 처리 실패',
  })
  createVoiceRecordFromStt(
    @CurrentUser() currentUser: JwtAccessPayload,
    @UploadedFile() voiceFile: VoiceRecordFile | undefined,
    @Body('recordMemo') recordMemo: string | undefined,
  ) {
    if (!voiceFile) {
      throw new BadRequestException('voiceFile is required.');
    }

    const trimmedRecordMemo = recordMemo?.trim();

    if (
      trimmedRecordMemo &&
      trimmedRecordMemo.length > RECORD_MEMO_MAX_LENGTH
    ) {
      throw new BadRequestException(
        `recordMemo must be shorter than or equal to ${RECORD_MEMO_MAX_LENGTH} characters.`,
      );
    }

    return this.recordService.createVoiceRecordFromStt(
      currentUser.sub,
      voiceFile,
      trimmedRecordMemo || null,
    );
  }

  @Post('text')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '텍스트 기록 생성',
    description: '제목, 내용, 연결 인물을 입력해 TEXT 타입 기록을 생성합니다.',
  })
  @ApiBody({ type: CreateTextRecordDto })
  @ApiCreatedResponse({
    description: '텍스트 기록 생성 성공',
    type: TextRecordEntity,
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패 또는 연결할 인물을 찾을 수 없음',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  createTextRecord(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: CreateTextRecordDto,
  ) {
    return this.recordService.createTextRecord(currentUser.sub, dto);
  }

  @Get('text/:recordId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '텍스트 기록 상세 조회',
    description:
      '텍스트 기록의 제목, 생성 시각, 내용, 연결 인물과 연결 일정 정보를 조회합니다.',
  })
  @ApiOkResponse({
    description: '텍스트 기록 상세 조회 성공',
    type: TextRecordDetailEntity,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '텍스트 기록을 찾을 수 없음',
  })
  getTextRecord(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('recordId') recordId: string,
  ) {
    return this.recordService.getTextRecord(currentUser.sub, recordId);
  }

  @Patch('text/:recordId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '텍스트 기록 수정',
    description:
      '텍스트 기록의 제목, 내용, 연결 인물을 수정합니다. personIds를 보내면 연결 인물 전체를 교체하며, 연결 일정 정보도 함께 반환합니다.',
  })
  @ApiBody({ type: UpdateTextRecordDto })
  @ApiOkResponse({
    description: '텍스트 기록 수정 성공',
    type: TextRecordDetailEntity,
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패 또는 연결할 인물을 찾을 수 없음',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '텍스트 기록을 찾을 수 없음',
  })
  updateTextRecord(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateTextRecordDto,
  ) {
    return this.recordService.updateTextRecord(currentUser.sub, recordId, dto);
  }

  @Get('voice/:recordId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '음성 기록 상세 조회',
    description:
      '음성 기록의 제목, 생성 시각, 연결 인물, 키워드, 내용, 메모, 녹음 파일 signed URL과 연결 일정 정보를 조회합니다.',
  })
  @ApiOkResponse({
    description: '음성 기록 상세 조회 성공',
    type: VoiceRecordDetailEntity,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '음성 기록을 찾을 수 없음',
  })
  getVoiceRecord(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('recordId') recordId: string,
  ) {
    return this.recordService.getVoiceRecord(currentUser.sub, recordId);
  }

  @Get('voice/summary/:recordId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '음성 기록 내용 요약',
    description:
      '음성 기록 content를 OpenAI API로 요약하고, 요약 결과로 기존 content를 덮어쓴 뒤 연결 일정 정보를 함께 반환합니다.',
  })
  @ApiOkResponse({
    description: '음성 기록 요약 성공',
    type: VoiceRecordSummaryEntity,
  })
  @ApiBadRequestResponse({
    description: '요약할 content가 비어 있음',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '음성 기록을 찾을 수 없음',
  })
  @ApiBadGatewayResponse({
    description: 'OpenAI 요약 처리 실패',
  })
  summarizeVoiceRecord(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('recordId') recordId: string,
  ) {
    return this.recordService.summarizeVoiceRecord(currentUser.sub, recordId);
  }

  @Patch('voice/:recordId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '음성 기록 수정',
    description:
      '음성 기록의 제목, 기록 메모, 연결 인물을 수정합니다. personIds를 보내면 연결 인물 전체를 교체하며, 연결 일정 정보도 함께 반환합니다.',
  })
  @ApiBody({ type: UpdateVoiceRecordDto })
  @ApiOkResponse({
    description: '음성 기록 수정 성공',
    type: VoiceRecordDetailEntity,
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패 또는 연결할 인물을 찾을 수 없음',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '음성 기록을 찾을 수 없음',
  })
  updateVoiceRecord(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('recordId') recordId: string,
    @Body() dto: UpdateVoiceRecordDto,
  ) {
    return this.recordService.updateVoiceRecord(currentUser.sub, recordId, dto);
  }
}

function isM4aFile(file: { mimetype: string; originalname?: string }): boolean {
  const originalName = file.originalname?.toLowerCase() ?? '';
  const hasM4aExtension = [...RECORD_VOICE_FILE_EXTENSIONS].some((extension) =>
    originalName.endsWith(extension),
  );

  return (
    hasM4aExtension &&
    RECORD_VOICE_FILE_CONTENT_TYPES.has(file.mimetype.toLowerCase())
  );
}
