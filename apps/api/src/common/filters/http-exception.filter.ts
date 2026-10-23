import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  BadRequestException,
  PayloadTooLargeException,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // Patched Multer 2.x added error codes and changed some messages. Nest 10
    // matches messages, so normalize recognized codes without echoing filenames
    // or field names from an untrusted multipart request.
    if (exception instanceof Error && exception.name === 'MulterError') {
      const code = (exception as Error & { code?: string }).code;
      if (code === 'LIMIT_FILE_SIZE') {
        exception = new PayloadTooLargeException('File too large');
      } else if ([
        'LIMIT_PART_COUNT', 'LIMIT_FILE_COUNT', 'LIMIT_FIELD_KEY',
        'LIMIT_FIELD_VALUE', 'LIMIT_FIELD_COUNT', 'LIMIT_UNEXPECTED_FILE',
        'MISSING_FIELD_NAME', 'LIMIT_FIELD_NESTING', 'LIMIT_FIELD_ARRAY_INDEX',
        'INVALID_FIELD_NAME', 'STREAM_DESTROYED',
      ].includes(code)) {
        exception = new BadRequestException('Invalid multipart upload');
      }
    }
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'An internal server error occurred';

    const errorDetails =
      typeof message === 'object' && message !== null
        ? (message as any)
        : { message };

    this.logger.error(
      `[${request.method}] ${request.url} - Status: ${status} - Error: ${JSON.stringify(
        errorDetails
      )}`,
      exception instanceof Error ? exception.stack : undefined
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      error: errorDetails.error || (status === 500 ? 'InternalServerError' : 'HttpError'),
      message: errorDetails.message || message,
    });
  }
}
