import { PrismaClient } from "@prisma/client/transcription/index.js";

import { SQLDatabase } from "encore.dev/storage/sqldb";

// Define the database connection
const psql = new SQLDatabase("transcription", {
  migrations: { path: "./migrations", source: "prisma" },
});

// Initialize Prisma client with the Encore-managed connection string
export const db = new PrismaClient({ datasourceUrl: psql.connectionString });
