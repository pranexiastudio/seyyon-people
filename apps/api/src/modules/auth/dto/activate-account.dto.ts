import { IsString, Matches, MinLength, MaxLength, ValidateBy } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ActivateAccountDto {
  @ApiProperty({ description: 'Single-use invitation token' })
  @IsString() @Matches(/^[a-f0-9]{64}$/)
  token!: string;

  @ApiProperty({ description: '12–72 UTF-8 bytes; uppercase, lowercase, number, and symbol' })
  @IsString() @MinLength(12) @MaxLength(72)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).+$/)
  @ValidateBy({ name: 'bcryptByteLimit', validator: { validate: value => typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= 72 } })
  password!: string;
}
