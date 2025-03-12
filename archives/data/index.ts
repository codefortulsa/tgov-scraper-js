/**
 * @see https://encore.dev/docs/ts/develop/orms/prisma
 */
import { Bucket } from "encore.dev/storage/objects";
import { SQLDatabase } from "encore.dev/storage/sqldb";
import { PrismaClient } from "@prisma/client/archives";

/**
 * Encore's Bucket definitions require string literals, so we have to define
 * them twice if we want to use them elsewhere in our code.
 */
export const bucket_meta = {
  AGENDA_BUCKET_NAME: "tgov-meeting-agendas",
  RECORDINGS_BUCKET_NAME: "tgov-meeting-recordings",
}

export const agendas = new Bucket("tgov-meeting-agendas", { versioned: false, public: true });
export const recordings = new Bucket("tgov-meeting-recordings", { versioned: false, public: true });

// Potential future feature: archive meeting minutes
// export const minutes = new Bucket("tgov-meeting-minutes", { versioned: false });

const psql = new SQLDatabase("archives", {
  migrations: { path: "./migrations", source: "prisma" },
});

// The url in our schema.prisma file points to Encore's shadow DB to allow
// Encore to orchestrate the infrastructure layer for us. Encore will provide us
// the correct value of the connection string at runtime, so we use it to over-
// ride the default value in the schema.prisma file.
export const db = new PrismaClient({ datasourceUrl: psql.connectionString });