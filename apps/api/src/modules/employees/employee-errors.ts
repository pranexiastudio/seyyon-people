import { BadRequestException, ConflictException, HttpException, InternalServerErrorException, NotFoundException } from '@nestjs/common';

export const employeeConflictMessage = 'Employee email or code conflicts with an existing record';

export function safeEmployeeError(error: unknown): HttpException {
  if (error instanceof HttpException) return error;
  const code = (error as { code?: string })?.code;
  if (code === 'P2002') return new ConflictException(employeeConflictMessage);
  if (code === 'P2003') return new BadRequestException('Invalid employee organization relationships');
  if (code === 'P2025') return new NotFoundException('Employee not found in this organization');
  return new InternalServerErrorException('Employee operation could not be completed');
}

export function safeEmployeeImportMessage(error: unknown): string {
  // Never reflect exception messages, database metadata or submitted row values.
  const status = safeEmployeeError(error).getStatus();
  switch (status) {
    case 400: return 'Invalid employee data or organization relationships';
    case 403: return 'Employee operation not permitted or organization seat limit reached';
    case 404: return 'Employee or organization not found';
    case 409: return employeeConflictMessage;
    default: return 'Employee could not be imported';
  }
}
