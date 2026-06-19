import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiInternalServerErrorResponse,
  ApiOkResponse,
  ApiOperation,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { GoogleLoginDto } from './dto/google-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('google')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Google ID Token 로그인' })
  @ApiBody({ type: GoogleLoginDto })
  @ApiOkResponse({
    description: 'Google 로그인 성공',
    schema: {
      example: {
        user: {
          id: 'clx0000000000000000000000',
          name: '홍길동',
          email: 'user@example.com',
          image: 'https://lh3.googleusercontent.com/a/example',
          role: 'USER',
          isPremium: false,
        },
      },
    },
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패',
  })
  @ApiUnauthorizedResponse({
    description: 'Google ID Token 검증 실패 또는 이메일 미인증 계정',
  })
  @ApiInternalServerErrorResponse({
    description: 'Google OAuth Client ID 미설정',
  })
  loginWithGoogle(@Body() dto: GoogleLoginDto) {
    return this.authService.loginWithGoogle(dto);
  }
}
