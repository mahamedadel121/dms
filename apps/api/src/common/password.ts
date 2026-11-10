import { randomBytes } from 'node:crypto';
import { hash, verify } from '@node-rs/argon2';

export const hashPassword = (pw: string): Promise<string> => hash(pw);
export async function verifyPassword(hashed: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashed, pw);
  } catch {
    return false;
  }
}
export const generatePassword = (): string => randomBytes(9).toString('base64url') + '#7';
