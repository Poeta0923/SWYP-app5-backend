import { Body, Controller, Patch, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
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
import { UpdateUserNameDto } from './dto/update-user-name.dto';
import { UserEntity } from './entities/user.entity';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Patch('me/name')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '사용자 이름 변경' })
  @ApiBody({ type: UpdateUserNameDto })
  @ApiOkResponse({
    description: '사용자 이름 변경 성공',
    type: UserEntity,
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
    description: '사용자를 찾을 수 없음',
  })
  updateMyName(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: UpdateUserNameDto,
  ) {
    return this.usersService.updateName(currentUser.sub, dto);
  }
}
