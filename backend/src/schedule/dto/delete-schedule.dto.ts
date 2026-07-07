import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class DeleteScheduleDto {
  @ApiProperty({
    description: '삭제할 일정 ID',
    example: 'clx0000000000000000000002',
  })
  @IsString()
  @MinLength(1)
  scheduleId: string;
}
