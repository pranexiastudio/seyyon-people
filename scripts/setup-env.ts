import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env")) {
  console.log(".env exists; left unchanged.");
} else {
  const secret = () => randomBytes(32).toString("hex");
  const replacements = {
    replace_with_random_owner_password: secret(),
    replace_with_random_runtime_password: secret(),
    replace_with_random_redis_password: secret(),
    replace_with_at_least_32_random_characters: secret(),
  };
  let content = readFileSync(".env.example", "utf8");
  for (const [placeholder, value] of Object.entries(replacements)) {
    content = content.replaceAll(placeholder, value);
  }
  writeFileSync(".env", content, { flag: "wx", mode: 0o600 });
  console.log("Created .env with random local credentials.");
}

