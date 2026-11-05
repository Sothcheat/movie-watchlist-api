import { Injectable, OnModuleInit } from '@nestjs/common';
import { argon2id, hash, verify } from 'argon2';
import { randomBytes } from 'node:crypto';

/** OWASP Password Storage Cheat Sheet minimum for Argon2id: 19 MiB, 2 iterations, 1 lane. */
const ARGON2_OPTIONS = {
  type: argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash: string;

  async onModuleInit(): Promise<void> {
    this.dummyHash = await hash(
      randomBytes(32).toString('hex'),
      ARGON2_OPTIONS,
    );
  }

  hash(password: string): Promise<string> {
    return hash(password, ARGON2_OPTIONS);
  }

  verify(passwordHash: string, password: string): Promise<boolean> {
    return verify(passwordHash, password);
  }

  /**
   * Does the same work as a real check and always fails. Used when the email is unknown,
   * so a login for a missing account takes as long as one with a wrong password.
   */
  async verifyAgainstDummy(password: string): Promise<false> {
    await verify(this.dummyHash, password);
    return false;
  }
}
