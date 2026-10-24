import { BadRequestException, Injectable, PayloadTooLargeException, PipeTransform } from '@nestjs/common';

export const MAX_EMPLOYEE_IMPORT_ROWS = 100;

@Injectable()
export class EmployeeImportLimitPipe implements PipeTransform {
  transform(value: unknown) {
    if (!Array.isArray(value) || value.length < 1 || value.length > MAX_EMPLOYEE_IMPORT_ROWS) {
      throw new BadRequestException(`Import must contain 1 to ${MAX_EMPLOYEE_IMPORT_ROWS} employee rows`);
    }
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 65536) throw new PayloadTooLargeException('Import payload must be 64 KiB or smaller');
    return value;
  }
}
