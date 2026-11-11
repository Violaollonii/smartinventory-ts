import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Role } from '../common/auth';

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  @Prop({ required: true, trim: true })
  name: string;

  /** bcrypt hash. `select: false` keeps it out of every query unless asked for. */
  @Prop({ required: true, select: false })
  passwordHash: string;

  @Prop({ type: String, required: true, enum: Object.values(Role), default: Role.Staff })
  role: Role;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
