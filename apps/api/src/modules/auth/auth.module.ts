import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { ActivationService } from './activation.service';
import { ActivationMailService } from './activation-mail.service';
import { ActivationRateGuard } from './activation-rate.guard';
import { BrowserAuthGuard } from './browser-auth.guard';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, ActivationService, ActivationMailService, ActivationRateGuard, BrowserAuthGuard],
  exports: [AuthService, JwtStrategy, PassportModule, ActivationService, ActivationRateGuard],
})
export class AuthModule {}
