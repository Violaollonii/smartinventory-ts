import { Body, Controller, Get, Module, Post } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Role, Roles } from '../common/auth';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserSchema } from './user.schema';
import { UsersService } from './users.service';

/** User management is admin-only. */
@Roles(Role.Admin)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  create(@Body() dto: CreateUserDto) {
    return this.users.create(dto);
  }

  @Get()
  findAll() {
    return this.users.findAll();
  }
}

@Module({
  imports: [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
