import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 },
      (error, key) => error ? reject(error) : resolve(key));
  });
}
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt$${salt}$${(await derive(password, salt)).toString("hex")}`;
}
const dummyHash = "scrypt$00000000000000000000000000000000$" + "00".repeat(64);
export async function verifyPassword(password: string, encoded: string | undefined) {
  const validFormat = /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(encoded ?? "");
  const [, salt, digest] = (validFormat ? encoded! : dummyHash).split("$");
  const derived = await derive(password, salt!);
  return timingSafeEqual(derived, Buffer.from(digest!, "hex")) && validFormat;
}

