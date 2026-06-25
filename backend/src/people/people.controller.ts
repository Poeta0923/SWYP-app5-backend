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
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { CreatePersonItemDto } from './dto/create-person-item.dto';
import { PersonCategoryNamesEntity } from './entities/person-category-names.entity';
import { PersonEntity, PersonListItemEntity } from './entities/person.entity';
import {
  type PersonCreateFiles,
  type PersonCreateFilesByIndex,
  type PersonImageFile,
  PeopleService,
} from './people.service';

const PERSON_IMAGE_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
// multipart에서 파일은 people JSON 배열의 index와 필드명으로 매핑한다.
// 예: people[0].image, people[1].businessCardFrontImage
const PERSON_FILE_FIELD_PATTERN =
  /^people\[(\d+)\]\.(image|businessCardFrontImage|businessCardBackImage)$/;
const CREATE_PEOPLE_MULTIPART_DESCRIPTION = [
  '`people`에는 Person 생성 정보 JSON 배열 문자열을 넣습니다.',
  '파일은 `people[0].image`처럼 배열 index로 매핑합니다.',
  '1명 등록도 배열로 전송합니다. 자세한 예시는 `people` 필드 예시를 참고하세요.',
].join('\n');

interface UploadedPersonMultipartFile extends PersonImageFile {
  fieldname: string;
}

@ApiTags('people')
@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
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
    summary: '인물 일괄 등록',
    description: CREATE_PEOPLE_MULTIPART_DESCRIPTION,
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['people'],
      properties: {
        people: {
          type: 'string',
          description: 'Person 생성 정보 JSON 문자열 배열',
          example: JSON.stringify([
            {
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
            },
            {
              name: '김영희',
              company: '카카오',
              extraContacts: [
                {
                  type: 'email',
                  content: 'kim@example.com',
                },
              ],
            },
          ]),
        },
        'people[0].image': {
          type: 'string',
          format: 'binary',
          description: '0번째 인물 프로필 이미지',
        },
        'people[0].businessCardFrontImage': {
          type: 'string',
          format: 'binary',
          description: '0번째 인물 명함 앞면 이미지',
        },
        'people[0].businessCardBackImage': {
          type: 'string',
          format: 'binary',
          description: '0번째 인물 명함 뒷면 이미지',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: '인물 일괄 등록 성공',
    type: PersonEntity,
    isArray: true,
  })
  @ApiBadRequestResponse({
    description: '요청 body 또는 파일 검증 실패',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  createPeople(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body('people') peopleJson: string | undefined,
    @UploadedFiles() files: UploadedPersonMultipartFile[] = [],
  ) {
    const people = this.parsePeople(peopleJson);
    const filesByIndex = this.mapFilesToPeople(people.length, files);

    return this.peopleService.createPeople(
      currentUser.sub,
      people,
      filesByIndex,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '사용자 인물 목록 조회' })
  @ApiOkResponse({
    description:
      '현재 사용자의 인물 이름, 전화번호, 프로필 이미지, 중요 여부 목록 조회 성공',
    type: PersonListItemEntity,
    isArray: true,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  getPeople(@CurrentUser() currentUser: JwtAccessPayload) {
    return this.peopleService.getPeople(currentUser.sub);
  }

  @Get('categories')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '인물 등록용 카테고리 이름 목록 조회' })
  @ApiOkResponse({
    description: '직군, 회사, 직책, 관계 이름 목록 조회 성공',
    type: PersonCategoryNamesEntity,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  getCategoryNames(@CurrentUser() currentUser: JwtAccessPayload) {
    return this.peopleService.getCategoryNames(currentUser.sub);
  }

  private parsePeople(peopleJson: string | undefined): CreatePersonItemDto[] {
    if (!peopleJson) {
      throw new BadRequestException('people is required.');
    }

    let parsedPeople: unknown;

    try {
      parsedPeople = JSON.parse(peopleJson);
    } catch {
      throw new BadRequestException('people must be a valid JSON array.');
    }

    if (!Array.isArray(parsedPeople)) {
      throw new BadRequestException('people must be a JSON array.');
    }

    if (parsedPeople.length === 0) {
      throw new BadRequestException('people must contain at least one item.');
    }

    if (
      parsedPeople.some(
        (person) =>
          typeof person !== 'object' ||
          person === null ||
          Array.isArray(person),
      )
    ) {
      throw new BadRequestException('people items must be objects.');
    }

    // people는 multipart의 문자열 필드라 전역 ValidationPipe가 nested item까지
    // 자동 검증하지 않는다. JSON parse 이후 DTO 인스턴스로 바꿔 직접 검증한다.
    const people = plainToInstance(CreatePersonItemDto, parsedPeople);
    const errors = people.flatMap((person) =>
      validateSync(person, {
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );

    if (errors.length > 0) {
      throw new BadRequestException('people contains invalid item data.');
    }

    return people;
  }

  private mapFilesToPeople(
    peopleCount: number,
    files: UploadedPersonMultipartFile[],
  ): PersonCreateFilesByIndex {
    const filesByIndex: PersonCreateFilesByIndex = new Map();

    // 파일 필드명에 담긴 배열 index를 기준으로 각 Person item에 파일을 묶는다.
    // 중복 필드와 people 배열 밖 index는 클라이언트 요청 오류로 처리한다.
    for (const file of files) {
      const match = PERSON_FILE_FIELD_PATTERN.exec(file.fieldname);

      if (!match) {
        throw new BadRequestException(
          `Invalid file field name: ${file.fieldname}`,
        );
      }

      const index = Number(match[1]);
      const fieldName = match[2] as keyof PersonCreateFiles;

      if (index >= peopleCount) {
        throw new BadRequestException(
          `File field index is out of range: ${file.fieldname}`,
        );
      }

      const personFiles = filesByIndex.get(index) ?? {};

      if (personFiles[fieldName]) {
        throw new BadRequestException(
          `Duplicate file field: ${file.fieldname}`,
        );
      }

      personFiles[fieldName] = file;
      filesByIndex.set(index, personFiles);
    }

    return filesByIndex;
  }
}
