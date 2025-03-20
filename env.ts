import path from "node:path";

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
  TRANSCRIPTION_DATABASE_URL: v.pipe(
    v.string(),
    v.url(),
    v.regex(/^postgresql:\/\/.*?sslmode=disable$/),
  ),
  CHROMIUM_PATH: v.optional(v.string()),
  OPENAI_API_KEY: v.string(),
  MICROSOFT_API_KEY: v.optional(v.string()),
  MICROSOFT_PHI4_API_ENDPOINT: v.optional(
    v.string(),
    "https://api.microsoft.com/v1/phi4",
  ),
  TMP_DIR: v.optional(v.string(), "." + path.sep + "tmp"),
});

const env = v.parse(Env, process.env);

export default env;
