import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { RequiredAgreementsGuard } from '../agreements/required-agreements.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { JwtAccessPayload } from '../auth/types/jwt-access-payload.type';
import { VerifyPurchaseDto } from './dto/verify-purchase.dto';
import {
  GooglePlayPurchaseService,
  VerifyPurchaseResult,
} from './google-play-purchase.service';

@ApiTags('billing')
@Controller('billing/google')
export class BillingController {
  constructor(private readonly purchaseService: GooglePlayPurchaseService) {}

  @Post('purchases/verify')
  @UseGuards(JwtAuthGuard, RequiredAgreementsGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: '구글 인앱 구독 구매 검증 및 요금제 반영' })
  @ApiOkResponse({ description: '검증 후 확정된 plan/status/만료시각' })
  verifyPurchase(
    @CurrentUser() currentUser: JwtAccessPayload,
    @Body() dto: VerifyPurchaseDto,
  ): Promise<VerifyPurchaseResult> {
    return this.purchaseService.verifyPurchase(currentUser.sub, dto);
  }
}
