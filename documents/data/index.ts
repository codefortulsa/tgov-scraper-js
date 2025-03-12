import { SQLDatabase } from "encore.dev/storage/sqldb";
import { PrismaClient } from "@prisma/client/documents/index.js";
import { Bucket } from "encore.dev/storage/objects";

// Define the database connection
const psql = new SQLDatabase("documents", {
  migrations: { path: "./migrations", source: "prisma" },
});

// Initialize Prisma client with the Encore-managed connection string
export const db = new PrismaClient({ datasourceUrl: psql.connectionString });

// Create documents bucket
export const agendas = new Bucket("agendas", {
  versioned: false,
  public: true,
});
