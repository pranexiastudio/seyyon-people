import { IsDateString, IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class PunchDto {
  @IsIn(['CHECK_IN', 'CHECK_OUT'])
  punchType!: 'CHECK_IN' | 'CHECK_OUT';
}

export class CorrectionDto {
  @IsDateString() date!: string;
  @IsDateString() checkIn!: string;
  @IsDateString() checkOut!: string;
  @IsString() @IsNotEmpty() @MaxLength(2000) reason!: string;
}

export class BiometricPunchDto extends PunchDto {
  @IsString() @IsNotEmpty() @MaxLength(100) deviceEmployeeCode!: string;
  @IsDateString() timestamp!: string;
  @IsString() @IsNotEmpty() @MaxLength(100) deviceId!: string;
  @IsOptional() @IsString() @MaxLength(100) deviceIp?: string;
  @IsOptional() @IsString() @MaxLength(10000) rawPayload?: string;
}
