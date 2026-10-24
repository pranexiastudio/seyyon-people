import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, IsOptional, IsEnum, IsDateString, ValidateIf } from 'class-validator';
import { EmploymentType, EmployeeStatus } from '@seyyon/shared';

export class CreateEmployeeDto {
  @ApiPropertyOptional({ example: 'EMP-101' })
  @IsString()
  @IsOptional()
  employeeCode?: string;

  @ApiProperty({ example: 'Aditi' })
  @IsString()
  @IsNotEmpty()
  firstName!: string;

  @ApiProperty({ example: 'Nair' })
  @IsString()
  @IsNotEmpty()
  lastName!: string;

  @ApiProperty({ example: 'aditi.nair@acmetech.com' })
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @ApiPropertyOptional({ example: '+91 98450 12345' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: 'ENG' })
  @IsString()
  @IsNotEmpty()
  departmentId!: string;

  @ApiProperty({ example: 'SR-DEV' })
  @IsString()
  @IsNotEmpty()
  designationId!: string;

  @ApiPropertyOptional({ example: 'EMP-003' })
  @IsString()
  @IsOptional()
  managerId?: string;

  @ApiPropertyOptional({ enum: EmploymentType, default: EmploymentType.FULL_TIME })
  @IsEnum(EmploymentType)
  @IsOptional()
  employmentType?: EmploymentType;

  @ApiPropertyOptional({ example: '2026-10-15' })
  @IsDateString()
  @IsOptional()
  dateOfJoining?: string;

  // Sensitive statutory fields
  @ApiPropertyOptional({ example: 'ABCDE1234F' })
  @IsString()
  @IsOptional()
  panNumber?: string;

  @ApiPropertyOptional({ example: '123456789012' })
  @IsString()
  @IsOptional()
  bankAccount?: string;

  @ApiPropertyOptional({ example: 'HDFC0001234' })
  @IsString()
  @IsOptional()
  bankIfsc?: string;
}

export class UpdateEmployeeDto {
  @ApiPropertyOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty()
  @ValidateIf((_object, value) => value !== undefined)
  firstName?: string;

  @ApiPropertyOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty()
  @ValidateIf((_object, value) => value !== undefined)
  lastName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty()
  @ValidateIf((_object, value) => value !== undefined)
  departmentId?: string;

  @ApiPropertyOptional()
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @IsNotEmpty()
  @ValidateIf((_object, value) => value !== undefined)
  designationId?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  managerId?: string | null;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @IsEnum(EmployeeStatus)
  @ValidateIf((_object, value) => value !== undefined)
  status?: EmployeeStatus;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  emergencyContactName?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  emergencyContactPhone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  address?: string;
}
