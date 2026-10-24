import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { getAllowedOrigins } from '../../common/config/cors.config';

@Injectable()
export class BrowserAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const origin = request.headers.origin;
    let valid = false;
    try {
      const url = new URL(origin);
      valid = url.origin === origin && getAllowedOrigins().includes(origin)
        && (process.env.NODE_ENV !== 'production' || url.protocol === 'https:');
    } catch { /* Missing, null, multiple or malformed origins fail closed. */ }
    if (!valid || request.headers['x-requested-with'] !== 'seyyon-browser'
      || !request.is('application/json')) {
      throw new ForbiddenException('Browser authentication request rejected');
    }
    return true;
  }
}
