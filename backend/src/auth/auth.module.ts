import { Body, Controller, Get, HttpCode, Injectable, Module, Post, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { compare, hashSync } from 'bcryptjs';
import { CurrentUser, Public, type JwtPayload } from '../common/auth';
import { UsersModule } from '../users/users.module';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

// Hash of a throwaway value, computed once at startup. Comparing against it
// when the email is unknown keeps response time similar to a wrong-password
// attempt, so the endpoint doesn't reveal which emails exist.
const DUMMY_HASH = hashSync('not-a-real-password', 12);

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.users.findByEmailWithPassword(dto.email);
    const passwordOk = await compare(dto.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const payload: JwtPayload = { sub: user.id, email: user.email, name: user.name, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    };
  }
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  /** Lets the frontend check that a stored token is still valid. */
  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return { id: user.sub, email: user.email, name: user.name, role: user.role };
  }
}

@Module({
  imports: [
    UsersModule,
    // global: true so the app-wide JwtAuthGuard can inject JwtService.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.getOrThrow('JWT_EXPIRES_IN') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
