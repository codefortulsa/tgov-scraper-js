import { Service } from "encore.dev/service";

/**
 * TGov service for scraping and providing access to Tulsa Government meeting data
 * 
 * This service is responsible for:
 * - Scraping the TGov index page
 * - Storing meeting and committee information
 * - Exposing APIs for accessing meeting data
 * - Providing methods to extract video download URLs
 */
export default new Service("tgov");