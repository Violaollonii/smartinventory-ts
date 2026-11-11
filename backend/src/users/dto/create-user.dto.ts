import { IsEmail, IsEnum, IsNotEmpty, IsString, MaxLength, MinLength } from 'class-validator';
import { Role } from '../../common/auth';

export class CreateUserDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  // bcrypt only looks at the first 72 bytes, so cap the length.
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsEnum(Role)
  role: Role;
}
