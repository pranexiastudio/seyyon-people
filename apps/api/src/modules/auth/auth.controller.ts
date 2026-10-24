import { Controller, Post, Body, Get, UseGuards, Req, Res, HttpCode, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Request, Response } from 'express';
import { BrowserAuthGuard } from './browser-auth.guard';
import { clearRefreshCookie, readRefreshCookie, writeRefreshCookie } from './browser-session';
import { ActivationService } from './activation.service';
import { ActivateAccountDto } from './dto/activate-account.dto';
import { ActivationRateGuard } from './activation-rate.guard';
import { ValidationPipe, UsePipes, BadRequestException } from '@nestjs/common';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly activationService: ActivationService) {}

  @Post('activate')
  @HttpCode(HttpStatus.OK)
  @UseGuards(ActivationRateGuard)
  @UsePipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true,
    exceptionFactory: () => new BadRequestException('Invalid activation request. Use a valid invitation and a password with 12–72 UTF-8 bytes, uppercase, lowercase, number, and symbol.') }))
  @ApiOperation({ summary: 'Set password using a single-use employee invitation; does not sign in' })
  async activate(@Body() dto: ActivateAccountDto) {
    return this.activationService.activate(dto);
  }

  @Post('login')
  @UseGuards(BrowserAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Browser login: return access token and set HttpOnly refresh cookie' })
  @ApiResponse({ status: 200, description: 'Access token, expiry and user; refresh token only in HttpOnly cookie' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or inactive account' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    const { refreshToken, ...result } = await this.authService.login(loginDto, ipAddress, userAgent);
    writeRefreshCookie(response, refreshToken);
    return result;
  }

  @Post('refresh')
  @UseGuards(BrowserAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate HttpOnly refresh cookie and retrieve new access token; empty JSON body' })
  @ApiResponse({ status: 200, description: 'Tokens successfully refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    this.requireEmptyBody(request);
    const token = readRefreshCookie(request);
    if (!token) throw new UnauthorizedException('Refresh session required');
    // Do not clear cookies on a failed rotation: another tab may have rotated successfully.
    const { refreshToken, ...result } = await this.authService.refreshTokens(token);
    writeRefreshCookie(response, refreshToken);
    return result;
  }

  @Post('logout')
  @UseGuards(BrowserAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke matching refresh-cookie session and clear cookie; access token not required' })
  async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    this.requireEmptyBody(request);
    let token: string | undefined;
    try {
      token = readRefreshCookie(request);
    } catch (error) {
      clearRefreshCookie(response);
      throw error;
    }
    // Keep a valid cookie on storage failure so sign-out can actually be retried.
    if (token) await this.authService.logoutRefreshSession(token);
    clearRefreshCookie(response);
    return { success: true, message: 'Logged out successfully' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Retrieve currently authenticated user profile and permissions' })
  async getMe(@CurrentUser() user: any, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    return { ...await this.authService.getMe(user.id), permissions: user.permissions };
  }

  private requireEmptyBody(request: Request) {
    if (request.body && Object.keys(request.body).length) {
      throw new BadRequestException('This endpoint accepts only the refresh cookie');
    }
  }
}
