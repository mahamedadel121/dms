import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req } from '@nestjs/common';
import type { AuthUser } from '@dms/core/rbac';
import {
  changePasswordSchema,
  loginSchema,
  refreshSchema,
  type ChangePasswordInput,
  type LoginInput,
  type RefreshInput,
} from '@dms/shared';
import { AuthOnly, CurrentUser, Public } from '../common/decorators';
import { actorFromReq } from '../common/actor';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';

type Req_ = Parameters<typeof actorFromReq>[0] & { sessionId?: string };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body(new ZodPipe(loginSchema)) b: LoginInput, @Req() req: Req_) {
    return this.auth.login(b.username, b.password, actorFromReq(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  refresh(@Body(new ZodPipe(refreshSchema)) b: RefreshInput, @Req() req: Req_) {
    return this.auth.refresh(b.refreshToken, actorFromReq(req));
  }

  @AuthOnly()
  @Post('logout')
  @HttpCode(200)
  async logout(@Req() req: Req_) {
    await this.auth.logout(req.sessionId!, actorFromReq(req));
    return { ok: true };
  }

  @AuthOnly()
  @Get('me')
  me(@CurrentUser() u: AuthUser) {
    return this.auth.buildMe(u.id);
  }

  @AuthOnly()
  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @CurrentUser() u: AuthUser,
    @Body(new ZodPipe(changePasswordSchema)) b: ChangePasswordInput,
    @Req() req: Req_,
  ) {
    await this.auth.changePassword(u.id, b.currentPassword, b.newPassword, req.sessionId!, actorFromReq(req));
    return { ok: true };
  }

  @AuthOnly()
  @Get('sessions')
  sessions(@CurrentUser() u: AuthUser, @Req() req: Req_) {
    return this.auth.listSessions(u.id, req.sessionId!);
  }

  @AuthOnly()
  @Delete('sessions/:id')
  async revoke(@CurrentUser() u: AuthUser, @Param('id') id: string, @Req() req: Req_) {
    await this.auth.revokeSession(u.id, id, actorFromReq(req));
    return { ok: true };
  }
}
