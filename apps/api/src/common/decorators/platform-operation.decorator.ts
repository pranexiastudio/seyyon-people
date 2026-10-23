import { SetMetadata } from '@nestjs/common';

// Only platform-wide handlers may operate without a tenant context.
export const PLATFORM_OPERATION = 'platformOperation';
export const PlatformOperation = () => SetMetadata(PLATFORM_OPERATION, true);
