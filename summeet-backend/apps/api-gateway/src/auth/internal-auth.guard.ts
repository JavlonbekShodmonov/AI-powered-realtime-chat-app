import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';

// Trust boundary: this guard does NOT verify end-user identity itself.
// It verifies that the request came from your own Next.js backend (which
// already ran `auth(req)` via NextAuth and confirmed who the user is).
//
// Next.js is responsible for:
//   1. Verifying the user's session with auth(req)
//   2. Calling api-gateway with header `x-internal-secret: <INTERNAL_API_SECRET>`
//   3. Passing the verified userId in the request body (see UserIdDto below)
//
// api-gateway trusts the userId in the body ONLY because this guard confirms
// the secret. Never expose this secret to the browser or extension — it must
// only ever live in Next.js server-side env vars and api-gateway's env vars.
//
// If you later let the extension call api-gateway directly, that path needs
// its own guard that verifies a real user token — do not reuse this one for
// browser-facing requests.
@Injectable()
export class InternalAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const providedSecret = request.headers['x-internal-secret'];
    const expectedSecret = process.env.INTERNAL_API_SECRET;

    if (!expectedSecret) {
      // Fail closed: if the secret isn't configured, refuse everything
      // rather than silently accepting unauthenticated requests.
      throw new UnauthorizedException('Internal auth is not configured');
    }

    if (!providedSecret || providedSecret !== expectedSecret) {
      throw new UnauthorizedException('Invalid internal service credentials');
    }

    return true;
  }
}
