import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity.js';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.users.findOneBy({ id });
  }

  /** Includes the password hash, which is excluded from every other query. */
  findByEmailWithPassword(email: string): Promise<User | null> {
    return this.users.findOne({
      where: { email },
      select: { id: true, email: true, role: true, passwordHash: true },
    });
  }

  /**
   * Inserts the user, or does nothing if the email is taken (ON CONFLICT DO NOTHING).
   * Deliberately reports nothing back, so registration can't reveal which emails exist.
   */
  async createIfAbsent(email: string, passwordHash: string): Promise<void> {
    await this.users
      .createQueryBuilder()
      .insert()
      .into(User)
      .values({ email, passwordHash })
      .orIgnore()
      .execute();
  }
}
