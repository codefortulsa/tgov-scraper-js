import dotenv from "@dotenvx/dotenvx";
import * as v from "valibot";

dotenv.config();

const Env = v.looseObject({
  ARCHIVES_DATABASE_URL: v.pipe(
    v.string(),
    v.url(),
    v.regex(/^postgresql:\/\/.*?sslmode=disable$/),
  ),
  DOCUMENTS_DATABASE_URL: v.pipe(
    v.string(),
    v.url(),
    v.regex(/^postgresql:\/\/.*?sslmode=disable$/),
  ),
  MEDIA_DATABASE_URL: v.pipe(
    v.string(),
    v.url(),
    v.regex(/^postgresql:\/\/.*?sslmode=disable$/),
  ),
  TGOV_DATABASE_URL: v.pipe(
    v.string(),
    v.url(),
    v.regex(/^postgresql:\/\/.*?sslmode=disable$/),
  ),
  CHROMIUM_PATH: v.optional(v.string()),
});

const env = v.parse(Env, process.env);

export default env;
