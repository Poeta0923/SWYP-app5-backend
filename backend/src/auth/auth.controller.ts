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
import { RefreshTokenDto } from './dto/refresh-token.dto';

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
        accessToken: 'access-token-value',
        refreshToken: 'refresh-token-value',
        isNewUser: false,
        user: {
          id: 'clx0000000000000000000000',
          name: '홍길동',
          email: 'user@example.com',
          image: 'https://lh3.googleusercontent.com/a/example',
          role: 'USER',
          isPremium: false,
        },
        agreements: [
          {
            type: 'TERMS',
            documentId: 'clx0000000000000000000001',
            version: '0.0.1',
            title: '이용 약관 동의(필수)',
            required: true,
            agreed: false,
          },
        ],
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

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Access Token 재발급' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({
    description: '토큰 재발급 성공',
    schema: {
      example: {
        accessToken: 'access-token-value',
        refreshToken: 'new-refresh-token-value',
      },
    },
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패',
  })
  @ApiUnauthorizedResponse({
    description: 'Refresh token 검증 실패 또는 세션 폐기',
  })
  @ApiInternalServerErrorResponse({
    description: '서버 내부 오류',
  })
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '로그아웃' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiOkResponse({
    description: '로그아웃 성공',
    schema: {
      example: {
        success: true,
      },
    },
  })
  @ApiBadRequestResponse({
    description: '요청 body 검증 실패',
  })
  @ApiInternalServerErrorResponse({
    description: '서버 내부 오류',
  })
  logout(@Body() dto: RefreshTokenDto) {
    return this.authService.logout(dto);
  }
}
