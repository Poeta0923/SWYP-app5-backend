import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { CreatePersonItemDto } from './dto/create-person-item.dto';
import { ImportPeopleDto } from './dto/import-people.dto';
import { PersonCategoryNamesEntity } from './entities/person-category-names.entity';
import { PersonEntity, PersonListItemEntity } from './entities/person.entity';
import {
  type PersonCreateFiles,
  type PersonImageFile,
  PeopleService,
} from './people.service';

const PERSON_IMAGE_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
// 단일 인물 등록 multipart 파일 필드명이다.
const PERSON_FILE_FIELD_PATTERN =
  /^(image|businessCardFrontImage|businessCardBackImage)$/;
const CREATE_PERSON_MULTIPART_DESCRIPTION = [
  '`person`에는 Person 생성 정보 JSON 객체 문자열을 넣습니다.',
  '파일은 `image`, `businessCardFrontImage`, `businessCardBackImage` 필드로 전송합니다.',
  '`/people/import`는 기기 연락처 초기 가져오기용이고, 이 API는 단일 인물 상세 등록용입니다.',
].join('\n');

interface UploadedPersonMultipartFile extends PersonImageFile {
  fieldname: string;
}

@ApiTags('people')
@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Post('import')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '기기 연락처 인물 일괄 가져오기',
    description:
      '서비스 가입 초기 기기 연락처에서 가져온 이름과 전화번호만 일괄 저장합니다.',
  })
  @ApiBody({ type: ImportPeopleDto })
  @ApiCreatedResponse({
    description: '연락처 인물 일괄 저장 성공',
    type: PersonListItemEntity,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  importPeople(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: ImportPeopleDto,
  ) {
    return this.peopleService.importPeople(currentUser.sub, dto.people);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @UseInterceptors(
    AnyFilesInterceptor({
      limits: {
        fileSize: PERSON_IMAGE_FILE_SIZE_LIMIT_BYTES,
      },
      fileFilter: (_request, file, callback) => {
        if (!PERSON_FILE_FIELD_PATTERN.test(file.fieldname)) {
          callback(
            new BadRequestException(
              `Invalid file field name: ${file.fieldname}`,
            ),
            false,
          );
          return;
        }

        if (!file.mimetype.startsWith('image/')) {
          callback(
            new BadRequestException('Only image files are allowed.'),
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
    summary: '단일 인물 등록',
    description: CREATE_PERSON_MULTIPART_DESCRIPTION,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['person'],
      properties: {
        person: {
          type: 'string',
          description: 'Person 생성 정보 JSON 객체 문자열',
          example: JSON.stringify({
            name: '홍길동',
            birthDate: '1990-01-01',
            isImportant: true,
            phoneNumber: '010-1234-5678',
            job: '개발/IT',
            company: '토스',
            position: '과장',
            relationship: '동료',
            personality: '차분하고 꼼꼼함',
            birthdayNotificationEnabled: true,
            scheduleNotificationEnabled: false,
            extraContacts: [
              {
                type: 'email',
                content: 'user@example.com',
              },
              {
                type: 'instagram',
                content: '@hong',
              },
            ],
          }),
        },
        image: {
          type: 'string',
          format: 'binary',
          description: '프로필 이미지',
        },
        businessCardFrontImage: {
          type: 'string',
          format: 'binary',
          description: '명함 앞면 이미지',
        },
        businessCardBackImage: {
          type: 'string',
          format: 'binary',
          description: '명함 뒷면 이미지',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: '인물 등록 성공',
    type: PersonEntity,
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
  createPerson(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body('person') personJson: string | undefined,
    @UploadedFiles() files: UploadedPersonMultipartFile[] = [],
  ) {
    const person = this.parsePerson(personJson);
    const personFiles = this.mapFilesToPerson(files);

    return this.peopleService.createPerson(currentUser.sub, person, personFiles);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '사용자 인물 목록 조회' })
  @ApiOkResponse({
    description:
      '현재 사용자의 인물 ID, 이름, 전화번호, 프로필 이미지, 중요 여부 목록 조회 성공',
    type: PersonListItemEntity,
    isArray: true,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  getPeople(@CurrentUser() currentUser: JwtAccessPayload) {
    return this.peopleService.getPeople(currentUser.sub);
  }

  @Get('categories')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '인물 등록용 카테고리 이름 목록 조회' })
  @ApiOkResponse({
    description: '직군, 회사, 직책, 관계 이름 목록 조회 성공',
    type: PersonCategoryNamesEntity,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  getCategoryNames(@CurrentUser() currentUser: JwtAccessPayload) {
    return this.peopleService.getCategoryNames(currentUser.sub);
  }

  private parsePerson(personJson: string | undefined): CreatePersonItemDto {
    if (!personJson) {
      throw new BadRequestException('person is required.');
    }

    let parsedPerson: unknown;

    try {
      parsedPerson = JSON.parse(personJson);
    } catch {
      throw new BadRequestException('person must be a valid JSON object.');
    }

    if (
      typeof parsedPerson !== 'object' ||
      parsedPerson === null ||
      Array.isArray(parsedPerson)
    ) {
      throw new BadRequestException('person must be a JSON object.');
    }

    // person은 multipart의 문자열 필드라 전역 ValidationPipe가 nested item까지
    // 자동 검증하지 않는다. JSON parse 이후 DTO 인스턴스로 바꿔 직접 검증한다.
    const person = plainToInstance(CreatePersonItemDto, parsedPerson);
    const errors = validateSync(person, {
      whitelist: true,
      forbidNonWhitelisted: true,
    });

    if (errors.length > 0) {
      throw new BadRequestException('person contains invalid data.');
    }

    return person;
  }

  private mapFilesToPerson(
    files: UploadedPersonMultipartFile[],
  ): PersonCreateFiles {
    const personFiles: PersonCreateFiles = {};

    // 단일 인물 등록에서는 각 파일 필드를 한 번씩만 허용한다.
    for (const file of files) {
      const match = PERSON_FILE_FIELD_PATTERN.exec(file.fieldname);

      if (!match) {
        throw new BadRequestException(
          `Invalid file field name: ${file.fieldname}`,
        );
      }

      const fieldName = match[1] as keyof PersonCreateFiles;

      if (personFiles[fieldName]) {
        throw new BadRequestException(
          `Duplicate file field: ${file.fieldname}`,
        );
      }

      personFiles[fieldName] = file;
    }

    return personFiles;
  }
}
