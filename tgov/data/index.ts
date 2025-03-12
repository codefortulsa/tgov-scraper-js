import { SQLDatabase } from "encore.dev/storage/sqldb";
import { PrismaClient } from "@prisma/client/tgov/index.js";

// Define the database connection
const psql = new SQLDatabase("tgov", {
  migrations: { path: "./migrations", source: "prisma" },
});

// Initialize Prisma client with the Encore-managed connection string
export const db = new PrismaClient({ datasourceUrl: psql.connectionString });
