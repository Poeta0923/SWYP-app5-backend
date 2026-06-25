import { Controller, Get, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { PersonCategoryNamesEntity } from './entities/person-category-names.entity';
import { PeopleService } from './people.service';

@ApiTags('people')
@Controller('people')
export class PeopleController {
  constructor(private readonly peopleService: PeopleService) {}

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
}
