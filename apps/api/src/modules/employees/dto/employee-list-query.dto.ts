import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeStatus } from '@seyyon/shared';

// Read the original value so global implicit conversion cannot turn arrays,
// objects, booleans or empty strings into apparently valid query parameters.
const text = ({ obj, key }: { obj: any; key: string }) =>
  typeof obj[key] === 'string' ? obj[key].trim() : obj[key];
const integer = ({ obj, key }: { obj: any; key: string }) => {
  const value = obj[key];
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return Number(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  return Number.NaN;
};
const supplied = (_object: unknown, value: unknown) => value !== undefined;

export class EmployeeListQueryDto {
  @ApiPropertyOptional({ maxLength: 200 })
  @ValidateIf(supplied)
  @Transform(text)
  @IsString() @MinLength(1) @MaxLength(200)
  @Matches(/^[^\u0000-\u001f\u007f]*$/)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @ValidateIf(supplied)
  @Transform(text)
  @IsUUID()
  departmentId?: string;

  @ApiPropertyOptional({ enum: EmployeeStatus })
  @ValidateIf(supplied)
  @Transform(text)
  @IsEnum(EmployeeStatus)
  status?: EmployeeStatus;

  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1000000 })
  @Transform(integer)
  @IsInt() @Min(1) @Max(1000000)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(integer)
  @IsInt() @Min(1) @Max(100)
  limit: number = 20;
}
