import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    try {
      await this.$connect();
    } catch (err) {
      console.warn('⚠️ Warning: Could not connect to PostgreSQL immediately on startup. (Ensure PostgreSQL or Docker Compose is running).');
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
