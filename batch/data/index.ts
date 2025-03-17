/**
 * Batch Service Database Connection
 */
import { PrismaClient } from "@prisma/client/batch/index.js";

import { SQLDatabase } from "encore.dev/storage/sqldb";

const psql = new SQLDatabase("batch", {
  migrations: { path: "./migrations", source: "prisma" },
});

// Initialize Prisma client with the Encore-managed connection string
export const db = new PrismaClient({ datasourceUrl: psql.connectionString });
