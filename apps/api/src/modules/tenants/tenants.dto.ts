import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { SubscriptionStatus } from '@seyyon/shared';

export class UpdateTenantDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) address?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(10) currency?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) timezone?: string;
}
export class TenantStatusDto {
  @IsEnum(SubscriptionStatus) status!: SubscriptionStatus;
}
