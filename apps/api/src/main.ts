import * as dotenv from 'dotenv';
dotenv.config();

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { validateJwtConfig } from './common/config/jwt.config';
import { getCorsOptions, getAllowedOrigins } from './common/config/cors.config';

async function bootstrap() {
  const logger = new Logger('SeyyonPeopleBootstrap');

  // Validate security configuration at startup (fails safely if invalid in production)
  validateJwtConfig();
  const allowedOrigins = getAllowedOrigins();
  logger.log(`🔒 Security: CORS configured with explicit allowed origins: [${allowedOrigins.join(', ')}]`);

  const app = await NestFactory.create(AppModule);

  // Enable Strict CORS with explicit allowlist and least-privilege headers/methods
  app.enableCors(getCorsOptions());

  // Global API Versioned Prefix
  app.setGlobalPrefix('api/v1');

  // Global Exception Filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // OpenAPI / Swagger Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Seyyon People — Enterprise Multi-Tenant HRMS API')
    .setDescription(
      'RESTful API documentation and schema specification for Seyyon People by Pranexia Studio. ' +
      'Features full tenant context isolation, role-based access control, attendance, leave, statutory payroll, work management, and team collaboration.'
    )
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 4000;
  await app.listen(port);

  logger.log(`🚀 Seyyon People API running on: http://localhost:${port}/api/v1`);
  logger.log(`📚 Interactive Swagger Docs ready at: http://localhost:${port}/api/docs`);
}

bootstrap();
