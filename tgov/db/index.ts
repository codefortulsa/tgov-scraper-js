import { PrismaClient } from "./client";

import { SQLDatabase } from "encore.dev/storage/sqldb";

export { Prisma } from "./client";

// Define the database connection
const psql = new SQLDatabase("tgov", {
  migrations: { path: "./migrations", source: "prisma" },
});

// Initialize Prisma client with the Encore-managed connection string
export const db = new PrismaClient({ datasourceUrl: psql.connectionString });
