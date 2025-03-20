import { PrismaClient } from "@prisma/client/media/index.js";

import { Bucket } from "encore.dev/storage/objects";
import { SQLDatabase } from "encore.dev/storage/sqldb";

// Define the database connection
const psql = new SQLDatabase("media", {
  migrations: { path: "./migrations", source: "prisma" },
});

// Initialize Prisma client with the Encore-managed connection string
export const db = new PrismaClient({ datasourceUrl: psql.connectionString });

// Create media buckets
export const recordings = new Bucket("recordings", {
  versioned: false,
  public: true,
});

export const bucket_meta = new Bucket("bucket-meta", {
  versioned: false,
  public: true,
});
