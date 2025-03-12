/**
 * Documents Service API Endpoints
 * 
 * Provides HTTP endpoints for document retrieval and management:
 * - Upload and store document files (PDFs, etc.)
 * - Retrieve document metadata and content
 * - Link documents to meeting records
 */
import { api } from "encore.dev/api";
import logger from "encore.dev/log";
import fs from "fs/promises";
import crypto from "crypto";
import path from "path";
import { fileTypeFromBuffer } from "file-type";
import { db, agendas } from "./data";

const whitelistedBinaryFileTypes = [
  "application/pdf",
]

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
    logger.info(`Downloading document from ${url}`);
    
    try {
      // Create a temporary file to store the downloaded document
      const urlHash = crypto.createHash("sha256").update(url).digest("base64url").substring(0, 12);
      const tempDir = `/tmp/${Date.now()}_${urlHash}`;
      const tempFilePath = `${tempDir}/document`;
      
      await fs.mkdir(tempDir, { recursive: true });
      
      // Download the document
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to download document: ${response.statusText}`);
      }
      
      const buffer = Buffer.from(await response.arrayBuffer());
      await fs.writeFile(tempFilePath, buffer);
      
      // Determine the file type
      const fileType = await fileTypeFromBuffer(buffer);
      const mimetype = fileType?.mime || "application/octet-stream";

      // ONLY ALLOW WHITELISTED FILE TYPES
      if (!whitelistedBinaryFileTypes.includes(mimetype)) {
        throw new Error(`Document has forbidden file type: ${mimetype}`);
      } 
      
      // Generate a key for storage
      const fileExt = fileType?.ext || "bin";
      const documentKey = `${urlHash}_${Date.now()}.${fileExt}`;
      
      // Upload to cloud storage
      const attrs = await agendas.upload(documentKey, buffer, {
        contentType: mimetype,
      });
      
      // Save metadata to database
      const document = await db.document.create({
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
      
      logger.info(`Document saved with ID: ${document.id}`);
      
      return {
        id: document.id,
        url: document.url || undefined,
        title: document.title || undefined,
        mimetype: document.mimetype,
      };
    } catch (error: any) {
      logger.error(`Error downloading document: ${error.message}`);
      throw error;
    }
  }
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
    
    const where = meetingRecordId ? { meetingRecordId } : {};
    
    const [documents, total] = await Promise.all([
      db.document.findMany({
        where,
        take: limit,
        skip: offset,
        orderBy: { createdAt: "desc" },
      }),
      db.document.count({ where }),
    ]);
    
    return {
      documents: documents.map(doc => ({
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
  }
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
  async (params: { id: string }): Promise<{
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
    
    const document = await db.document.findUnique({
      where: { id },
    });
    
    if (!document) {
      throw new Error(`Document with ID ${id} not found`);
    }
    
    return {
      id: document.id,
      title: document.title || undefined,
      description: document.description || undefined,
      url: document.url || undefined,
      mimetype: document.mimetype,
      fileSize: document.fileSize || undefined,
      createdAt: document.createdAt,
      meetingRecordId: document.meetingRecordId || undefined,
    };
  }
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
    
    // Filter out undefined values
    const data = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );
    
    await db.document.update({
      where: { id },
      data,
    });
    
    return { success: true };
  }
);
