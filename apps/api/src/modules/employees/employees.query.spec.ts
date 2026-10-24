import { ValidationPipe } from '@nestjs/common';
import { EmployeeListQueryDto } from './dto/employee-list-query.dto';
import { EmployeesController } from './employees.controller';

describe('Employee list query validation', () => {
  const pipe = new ValidationPipe({
    whitelist: true, forbidNonWhitelisted: true, transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
  const validate = (value: unknown) => pipe.transform(value, { type: 'query', metatype: EmployeeListQueryDto });

  it('binds the runtime query DTO to the controller for the global ValidationPipe', () => {
    expect(Reflect.getMetadata('design:paramtypes', EmployeesController.prototype, 'findAll')[1]).toBe(EmployeeListQueryDto);
  });

  it('preserves page/limit defaults and accepts valid trimmed filters', async () => {
    await expect(validate({})).resolves.toMatchObject({ page: 1, limit: 20 });
    await expect(validate({ page: '2', limit: '100', search: '  Test User  ', status: 'ACTIVE',
      departmentId: '6b44a73b-f964-4ed6-9166-5939a9b4db54' })).resolves.toMatchObject({
      page: 2, limit: 100, search: 'Test User', status: 'ACTIVE', departmentId: '6b44a73b-f964-4ed6-9166-5939a9b4db54',
    });
  });

  it.each(['page', 'limit'])('rejects malformed %s values with HTTP 400', async field => {
    for (const value of ['', ' ', '0', '-1', '1.5', '1e2', 'Infinity', 'NaN', '01', '0x10', '99999999999999999999', [], ['1'], {}, true, null]) {
      await expect(validate({ [field]: value })).rejects.toMatchObject({ status: 400 });
    }
  });

  it.each([
    { page: '1000001' }, { limit: '101' }, { search: '' }, { search: '  ' },
    { search: 'a'.repeat(201) }, { search: 'name\u0000value' }, { search: ['name'] }, { search: { contains: 'name' } },
    { search: null }, { status: 'INVALID' }, { status: ['ACTIVE'] }, { status: null },
    { departmentId: '' }, { departmentId: 'not-a-uuid' }, { departmentId: { tenantId: 'foreign' } }, { departmentId: null },
    { tenantId: 'foreign' }, { includeSensitive: 'true' }, { pageSize: '20' },
  ])('rejects invalid filters and unknown query keys %#', async query => {
    await expect(validate(query)).rejects.toMatchObject({ status: 400 });
  });
});
