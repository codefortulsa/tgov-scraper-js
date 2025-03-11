import { Service } from "encore.dev/service";

/**
 * Documents service for managing document files and metadata
 * 
 * This service is responsible for:
 * - Storing and retrieving document files (PDFs, etc.)
 * - Managing document metadata
 * - Providing APIs for document access
 */
export default new Service("documents");
