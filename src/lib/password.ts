import bcrypt from "bcryptjs";

/** 密码哈希 / 校验（bcrypt，cost 10） */
export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function verifyPassword(plain: string, hash: string | null): boolean {
  if (!hash) return false;
  return bcrypt.compareSync(plain, hash);
}
