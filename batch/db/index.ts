/**
 * Batch Service Database Connection
 */
import { PrismaClient } from "./client";

import { api } from "encore.dev/api";
import { SQLDatabase } from "encore.dev/storage/sqldb";

const psql = new SQLDatabase("batch", {
  migrations: { path: "./migrations", source: "prisma" },
});

// Initialize Prisma client with the Encore-managed connection string
export const db = new PrismaClient({ datasourceUrl: psql.connectionString });

export const dbDocs = api.static({
  auth: false,
  dir: "./docs",
  path: "/docs/models/batch",
});
