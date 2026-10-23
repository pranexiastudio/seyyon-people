import { CanActivate, ExecutionContext, HttpException, Injectable } from '@nestjs/common';

@Injectable()
export class ActivationRateGuard implements CanActivate {
  private readonly buckets = new Map<string, { count: number; resetAt: number }>();
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    // Do not trust arbitrary forwarded-for headers. Configure trusted proxies at deployment.
    const key = request.ip || request.socket?.remoteAddress || 'unknown';
    const now = Date.now();
    for (const [ip, entry] of this.buckets) if (entry.resetAt <= now) this.buckets.delete(ip);
    const bucket = this.buckets.get(key) || { count: 0, resetAt: now + 60000 };
    if ((!this.buckets.has(key) && this.buckets.size >= 10000) || ++bucket.count > 10) {
      throw new HttpException('Too many requests. Please try again later.', 429);
    }
    this.buckets.set(key, bucket);
    return true;
  }
}
