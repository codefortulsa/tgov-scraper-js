/**
 * Documents Service API Endpoints
 *
 * Provides HTTP endpoints for document retrieval and management:
 * - Upload and store document files (PDFs, etc.)
 * - Retrieve document metadata and content
 * - Link documents to meeting records
 */
import crypto from "crypto";
import path from "path";

import { agendas, db } from "./data";

import { api, APIError } from "encore.dev/api";
import log from "encore.dev/log";

import { fileTypeFromBuffer } from "file-type";

/** File types allowed for document uploads */
const whitelistedBinaryFileTypes = ["application/pdf"];

/**
 * Download and store a document from a URL
 */
export const downloadDocument = api(
  {
    method: "POST",
    path: "/api/documents/download",
    expose: true,
  },
  async (params: {
    url: string;
    title?: string;
    meetingRecordId?: string;
    description?: string;
  }): Promise<{
    id: string;
    url?: string;
    title?: string;
    mimetype?: string;
  }> => {
    const { url, title, meetingRecordId, description } = params;
    log.info(`Downloading document`, { url, meetingRecordId });

    try {
      // Download the document
      const response = await fetch(url);
      if (!response.ok) {
        log.error(`Failed to fetch document`, {
          url,
          status: response.status,
          statusText: response.statusText,
        });
        throw APIError.internal(
          `Failed to fetch document: ${response.statusText}`,
        );
      }

      const buffer = Buffer.from(await response.arrayBuffer());

      // Determine the file type
      const fileType = await fileTypeFromBuffer(buffer);
      const fileExt = fileType?.ext || "bin";
      const mimetype = fileType?.mime || "application/octet-stream";

      // ONLY ALLOW WHITELISTED FILE TYPES
      if (!whitelistedBinaryFileTypes.includes(mimetype)) {
        log.warn(`Document has forbidden file type`, { url, mimetype });
        throw APIError.invalidArgument(
          `Document has forbidden file type: ${mimetype}`,
        );
      }

      // Generate a key for storage
      const urlHash = crypto
        .createHash("sha256")
        .update(url)
        .digest("base64url")
        .substring(0, 12);
      const documentKey = `${urlHash}_${Date.now()}.${fileExt}`;

      // Upload to cloud storage
      const attrs = await agendas.upload(documentKey, buffer, {
        contentType: mimetype,
      });

      // Save metadata to database
      const documentFile = await db.documentFile.create({
        data: {
          bucket: "agendas",
          key: documentKey,
          mimetype,
          url: agendas.publicUrl(documentKey),
          srcUrl: url,
          meetingRecordId,
          title: title || path.basename(new URL(url).pathname),
          description,
          fileSize: attrs.size,
        },
      });

      log.info(`Document saved successfully`, {
        id: documentFile.id,
        size: attrs.size,
        mimetype,
      });

      return {
        id: documentFile.id,
        url: documentFile.url || undefined,
        title: documentFile.title || undefined,
        mimetype: documentFile.mimetype,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      log.error(`Error downloading document`, {
        url,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal(
        `Error downloading document: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  },
);

/**
 * List all documents with optional filtering
 */
export const listDocuments = api(
  {
    method: "GET",
    path: "/api/documents",
    expose: true,
  },
  async (params: {
    limit?: number;
    offset?: number;
    meetingRecordId?: string;
  }): Promise<{
    documents: Array<{
      id: string;
      title?: string;
      description?: string;
      url?: string;
      mimetype: string;
      fileSize?: number;
      createdAt: Date;
    }>;
    total: number;
  }> => {
    const { limit = 20, offset = 0, meetingRecordId } = params;

    try {
      const where = meetingRecordId ? { meetingRecordId } : {};

      const [documentFiles, total] = await Promise.all([
        db.documentFile.findMany({
          where,
          take: limit,
          skip: offset,
          orderBy: { createdAt: "desc" },
        }),
        db.documentFile.count({ where }),
      ]);

      log.debug(`Listed documents`, {
        count: documentFiles.length,
        total,
        meetingRecordId: meetingRecordId || "none",
      });

      return {
        documents: documentFiles.map((doc) => ({
          id: doc.id,
          title: doc.title || undefined,
          description: doc.description || undefined,
          url: doc.url || undefined,
          mimetype: doc.mimetype,
          fileSize: doc.fileSize || undefined,
          createdAt: doc.createdAt,
        })),
        total,
      };
    } catch (error) {
      log.error(`Failed to list documents`, {
        meetingRecordId: meetingRecordId || "none",
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal(`Failed to list documents`);
    }
  },
);

/**
 * Get document details by ID
 */
export const getDocument = api(
  {
    method: "GET",
    path: "/api/documents/:id",
    expose: true,
  },
  async (params: {
    id: string;
  }): Promise<{
    id: string;
    title?: string;
    description?: string;
    url?: string;
    mimetype: string;
    fileSize?: number;
    createdAt: Date;
    meetingRecordId?: string;
  }> => {
    const { id } = params;

    try {
      const documentFile = await db.documentFile.findUnique({
        where: { id },
      });

      if (!documentFile) {
        log.info(`Document not found`, { id });
        throw APIError.notFound(`Document with ID ${id} not found`);
      }

      log.debug(`Retrieved document`, { id });

      return {
        id: documentFile.id,
        title: documentFile.title || undefined,
        description: documentFile.description || undefined,
        url: documentFile.url || undefined,
        mimetype: documentFile.mimetype,
        fileSize: documentFile.fileSize || undefined,
        createdAt: documentFile.createdAt,
        meetingRecordId: documentFile.meetingRecordId || undefined,
      };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      log.error(`Failed to get document`, {
        id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal(`Failed to get document`);
    }
  },
);

/**
 * Update document metadata
 */
export const updateDocument = api(
  {
    method: "PATCH",
    path: "/api/documents/:id",
    expose: true,
  },
  async (params: {
    id: string;
    title?: string;
    description?: string;
    meetingRecordId?: string | null;
  }): Promise<{ success: boolean }> => {
    const { id, ...updates } = params;

    try {
      // Check if document exists
      const exists = await db.documentFile.findUnique({
        where: { id },
        select: { id: true },
      });

      if (!exists) {
        log.info(`Document not found for update`, { id });
        throw APIError.notFound(`Document with ID ${id} not found`);
      }

      // Filter out undefined values
      const data: typeof updates = Object.fromEntries(
        Object.entries(updates).filter(([_, v]) => typeof v !== "undefined"),
      );

      await db.documentFile.update({
        where: { id },
        data,
      });

      log.info(`Updated document metadata`, { id, fields: Object.keys(data) });

      return { success: true };
    } catch (error) {
      if (error instanceof APIError) {
        throw error;
      }

      log.error(`Failed to update document`, {
        id,
        error: error instanceof Error ? error.message : String(error),
      });

      throw APIError.internal(`Failed to update document`);
    }
  },
);
