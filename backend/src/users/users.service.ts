import { ConflictException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { hash } from 'bcryptjs';
import { Model } from 'mongoose';
import { CreateUserDto } from './dto/create-user.dto';
import { User, UserDocument } from './user.schema';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  async create(dto: CreateUserDto): Promise<UserDocument> {
    const email = dto.email.toLowerCase().trim();
    if (await this.userModel.exists({ email })) {
      throw new ConflictException('A user with this email already exists');
    }
    const passwordHash = await hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.userModel.create({ email, name: dto.name, role: dto.role, passwordHash });
    user.passwordHash = undefined as unknown as string; // never leak the hash in a response
    return user;
  }

  findAll(): Promise<UserDocument[]> {
    return this.userModel.find().sort({ name: 1 }).exec();
  }

  /** Only the login flow needs the hash, so it is the only place that selects it. */
  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email: email.toLowerCase().trim() }).select('+passwordHash').exec();
  }
}
