import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import type {
  NotificationType,
  Prisma,
} from '../../../generated/prisma/client';
import type { NotificationResponse } from '../notification.service';

export class NotificationEntity implements NotificationResponse {
  @ApiProperty({
    example: 'clx0000000000000000000001',
    description: '알림 ID',
  })
  id: string;

  @ApiProperty({
    example: 'SCHEDULE',
    description: '알림 타입',
    enum: ['SCHEDULE', 'BIRTHDAY'],
  })
  type: NotificationType;

  @ApiProperty({
    example: '점심 약속',
    description: '알림 제목',
  })
  title: string;

  @ApiProperty({
    example: '2026. 7. 7. 오후 3:00 일정이 예정되어 있습니다.',
    description: '알림 본문',
  })
  body: string;

  @ApiPropertyOptional({
    example: {
      type: 'SCHEDULE',
      scheduleId: 'clx0000000000000000000002',
    },
    description: '앱에서 화면 이동 등에 사용할 알림 data payload',
    nullable: true,
  })
  data: Prisma.JsonValue | null;

  @ApiPropertyOptional({
    example: 'clx0000000000000000000002',
    description: '일정 알림인 경우 연결된 일정 ID',
    nullable: true,
  })
  scheduleId: string | null;

  @ApiPropertyOptional({
    example: 'clx0000000000000000000003',
    description: '생일 알림인 경우 연결된 인물 ID',
    nullable: true,
  })
  personId: string | null;

  @ApiProperty({
    example: '2026-07-05T12:00:00.000Z',
    description: '알림 발송 성공 시각',
  })
  sentAt: string;

  @ApiPropertyOptional({
    example: '2026-07-05T12:05:00.000Z',
    description: '알림 읽음 처리 시각',
    nullable: true,
  })
  readAt: string | null;

  @ApiProperty({
    example: false,
    description: '알림 읽음 여부',
  })
  isRead: boolean;
}
