import { Body, Controller, INestApplication, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { FileInterceptor } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as bcrypt from 'bcrypt';
import request = require('supertest');
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivationMailService } from '../../modules/auth/activation-mail.service';
import { HttpExceptionFilter } from '../filters/http-exception.filter';

// Synthetic fixture produced with bcrypt 5.1.1 before upgrading; no real account data.
const legacyPassword = "Legacy-test-password-2026!";
const legacyHash = "$2b$04$7XTUHBZwHp.4R7ofa5NLRuOXSzQsUu3ykEJqRhzgKHSsBl1hcT4XS";

const uploadLimits = { fileSize: 32, files: 1, fieldNestingDepth: 3, fieldArrayIndexLimit: 100 };

@Controller('dependency-probe')
class DependencyProbeController {
  @Post('json')
  json(@Body() body: any) { return body; }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file', { limits: uploadLimits }))
  upload(@UploadedFile() file: any) { return { size: file.size }; }
}

describe('Security dependency compatibility', () => {
  it('verifies existing bcrypt 5 hashes and still rejects incorrect passwords', async () => {
    expect(await bcrypt.compare(legacyPassword, legacyHash)).toBe(true);
    expect(await bcrypt.compare(legacyPassword, legacyHash.replace('$2b$', '$2a$'))).toBe(true);
    expect(await bcrypt.compare('incorrect-password', legacyHash)).toBe(false);
    const fresh = await bcrypt.hash(legacyPassword, 4);
    expect(await bcrypt.compare(legacyPassword, fresh)).toBe(true);
  });

  it('generates Swagger for the existing application, including activation DTOs', async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService).useValue({})
      .overrideProvider(ActivationMailService).useValue({ sendInvitation: jest.fn() })
      .compile();
    const app = module.createNestApplication();
    try {
      app.setGlobalPrefix('api/v1');
      const document = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('Compatibility probe').setVersion('1').build());
      expect(document.paths['/api/v1/auth/activate']).toBeDefined();
      expect(document.paths['/api/v1/employees']).toBeDefined();
      expect(document.components.schemas.ActivateAccountDto).toBeDefined();
    } finally { await app.close(); }
  });

  describe('Nest Express and Multer adapters', () => {
    let app: INestApplication;
    beforeAll(async () => {
      const module = await Test.createTestingModule({ controllers: [DependencyProbeController] }).compile();
      app = module.createNestApplication();
      app.useGlobalFilters(new HttpExceptionFilter());
      await app.init();
    });
    afterAll(async () => { await app?.close(); });

    it('parses JSON and URL-encoded requests', async () => {
      await request(app.getHttpServer()).post('/dependency-probe/json').send({ probe: 'json' }).expect(201, { probe: 'json' });
      await request(app.getHttpServer()).post('/dependency-probe/json').type('form').send({ probe: 'form' }).expect(201, { probe: 'form' });
    });
    it('accepts multipart uploads and retains Nest file-size error handling', async () => {
      await request(app.getHttpServer()).post('/dependency-probe/upload').attach('file', Buffer.from('probe'), 'probe.txt').expect(201, { size: 5 });
      await request(app.getHttpServer()).post('/dependency-probe/upload').attach('file', Buffer.alloc(33), 'oversized.txt').expect(413);
      await request(app.getHttpServer()).post('/dependency-probe/upload').attach('unexpected', Buffer.from('probe'), 'probe.txt').expect(400);
      await request(app.getHttpServer()).post('/dependency-probe/upload').field('probe[999999999]', 'bad').attach('file', Buffer.from('probe'), 'probe.txt').expect(400);
    });
  });
});
