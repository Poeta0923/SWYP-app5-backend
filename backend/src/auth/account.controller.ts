import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { DeleteAccountDto } from './dto/delete-account.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import type { JwtAccessPayload } from './types/jwt-access-payload.type';

@Controller('account')
export class AccountController {
  constructor(private readonly authService: AuthService) {}

  @Post('delete')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '회원 탈퇴' })
  @ApiBody({ type: DeleteAccountDto })
  @ApiOkResponse({
    description: '회원 탈퇴 성공',
    schema: {
      example: {
        success: true,
      },
    },
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패',
  })
  @ApiUnauthorizedResponse({
    description:
      'Access token 검증 실패, Google ID Token 검증 실패, 또는 재인증 계정 불일치',
  })
  deleteAccount(
    // JwtAuthGuard가 검증한 access token payload다. 이 값으로 "현재 앱 계정"을 식별한다.
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: DeleteAccountDto,
  ) {
    return this.authService.deleteAccount(currentUser, dto);
  }
}
