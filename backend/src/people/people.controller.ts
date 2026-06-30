import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor, FileInterceptor } from '@nestjs/platform-express';
import {
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
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { CreatePersonMultipartDto } from './dto/create-person-multipart.dto';
import { CreatePersonItemDto } from './dto/create-person-item.dto';
import { ImportPeopleDto } from './dto/import-people.dto';
import { PersonProfileImageMultipartDto } from './dto/person-profile-image-multipart.dto';
import { UpdatePersonItemDto } from './dto/update-person-item.dto';
import { PersonCategoryNamesEntity } from './entities/person-category-names.entity';
import {
  ImportedPersonListItemEntity,
  PersonDetailEntity,
  PersonEntity,
  PersonListItemEntity,
} from './entities/person.entity';
import {
  type PersonCreateFiles,
  type PersonImageFile,
  PeopleService,
} from './people.service';

const PERSON_IMAGE_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;
// 단일 인물 등록 multipart 파일 필드명이다.
const PERSON_FILE_FIELD_PATTERN =
  /^(image|businessCardFrontImage|businessCardBackImage)$/;
const PERSON_PROFILE_IMAGE_FILE_FIELD_NAME = 'image';
const PERSON_IMAGE_FILE_INTERCEPTOR_OPTIONS = {
  limits: {
    fileSize: PERSON_IMAGE_FILE_SIZE_LIMIT_BYTES,
  },
  fileFilter: (
    _request: unknown,
    file: { fieldname: string; mimetype: string },
    callback: (error: Error | null, acceptFile: boolean) => void,
  ) => {
    if (file.fieldname !== PERSON_PROFILE_IMAGE_FILE_FIELD_NAME) {
      callback(
        new BadRequestException(`Invalid file field name: ${file.fieldname}`),
        false,
      );
      return;
    }

    if (!file.mimetype.startsWith('image/')) {
      callback(new BadRequestException('Only image files are allowed.'), false);
      return;
    }

    callback(null, true);
  },
};
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
    type: ImportedPersonListItemEntity,
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
    description:
      '단일 인물을 등록합니다. 연락처 기반 인물 등록과 다르게 name, phoneNumber 외의 다른 정보들을 입력할 수 있습니다.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: CreatePersonMultipartDto })
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

    return this.peopleService.createPerson(
      currentUser.sub,
      person,
      personFiles,
    );
  }

  @Get()
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '사용자 인물 목록 조회' })
  @ApiOkResponse({
    description:
      '현재 사용자의 인물 ID, 이름, 전화번호, 프로필 이미지, 중요 여부, 직군, 회사, 직책, 관계 목록 조회 성공',
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

  @Get(':personId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '인물 상세 조회' })
  @ApiOkResponse({
    description: '현재 사용자의 인물 상세 정보 조회 성공',
    type: PersonDetailEntity,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '인물을 찾을 수 없음',
  })
  getPerson(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('personId') personId: string,
  ) {
    return this.peopleService.getPerson(currentUser.sub, personId);
  }

  @Post(':personId/profile-image')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @UseInterceptors(
    FileInterceptor(
      PERSON_PROFILE_IMAGE_FILE_FIELD_NAME,
      PERSON_IMAGE_FILE_INTERCEPTOR_OPTIONS,
    ),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '인물 프로필 이미지 추가',
    description:
      '프로필 이미지가 없는 인물에게 프로필 이미지를 추가합니다. 인물 1명당 프로필 이미지는 1개만 가질 수 있습니다.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: PersonProfileImageMultipartDto })
  @ApiCreatedResponse({
    description: '프로필 이미지 추가 성공',
    type: PersonDetailEntity,
  })
  @ApiBadRequestResponse({
    description: '파일 검증 실패',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '인물을 찾을 수 없음',
  })
  addPersonProfileImage(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('personId') personId: string,
    @UploadedFile() image: UploadedPersonMultipartFile | undefined,
  ) {
    return this.peopleService.addPersonProfileImage(
      currentUser.sub,
      personId,
      this.requireProfileImage(image),
    );
  }

  @Patch(':personId/profile-image')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @UseInterceptors(
    FileInterceptor(
      PERSON_PROFILE_IMAGE_FILE_FIELD_NAME,
      PERSON_IMAGE_FILE_INTERCEPTOR_OPTIONS,
    ),
  )
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '인물 프로필 이미지 변경' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: PersonProfileImageMultipartDto })
  @ApiOkResponse({
    description: '프로필 이미지 변경 성공',
    type: PersonDetailEntity,
  })
  @ApiBadRequestResponse({
    description: '파일 검증 실패',
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '인물 또는 프로필 이미지를 찾을 수 없음',
  })
  updatePersonProfileImage(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('personId') personId: string,
    @UploadedFile() image: UploadedPersonMultipartFile | undefined,
  ) {
    return this.peopleService.updatePersonProfileImage(
      currentUser.sub,
      personId,
      this.requireProfileImage(image),
    );
  }

  @Delete(':personId/profile-image')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '인물 프로필 이미지 삭제' })
  @ApiOkResponse({
    description: '프로필 이미지 삭제 성공',
    type: PersonDetailEntity,
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '인물 또는 프로필 이미지를 찾을 수 없음',
  })
  deletePersonProfileImage(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('personId') personId: string,
  ) {
    return this.peopleService.deletePersonProfileImage(
      currentUser.sub,
      personId,
    );
  }

  @Delete(':personId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '인물 삭제' })
  @ApiOkResponse({
    description: '인물 삭제 성공',
    schema: {
      example: {
        success: true,
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Access token 검증 실패 또는 세션 만료',
  })
  @ApiForbiddenResponse({
    description: '필수 약관 미동의',
  })
  @ApiNotFoundResponse({
    description: '인물을 찾을 수 없음',
  })
  deletePerson(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('personId') personId: string,
  ) {
    return this.peopleService.deletePerson(currentUser.sub, personId);
  }

  @Patch(':personId')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: '인물 정보 수정',
    description:
      '프로필 이미지와 명함 이미지를 제외한 인물 기본 정보와 추가 연락처를 수정합니다. extraContacts를 생략하면 유지하고, 빈 배열로 보내면 모두 삭제합니다.',
  })
  @ApiBody({ type: UpdatePersonItemDto })
  @ApiOkResponse({
    description: '인물 정보 수정 성공',
    type: PersonDetailEntity,
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
  @ApiNotFoundResponse({
    description: '인물을 찾을 수 없음',
  })
  updatePerson(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Param('personId') personId: string,
    @Body() dto: UpdatePersonItemDto,
  ) {
    return this.peopleService.updatePerson(currentUser.sub, personId, dto);
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

  private requireProfileImage(
    file: UploadedPersonMultipartFile | undefined,
  ): PersonImageFile {
    if (!file) {
      throw new BadRequestException('image is required.');
    }

    return file;
  }
}
