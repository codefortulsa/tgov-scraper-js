import { Service } from "encore.dev/service";

/**
 * Media service for managing audio and video processing
 * 
 * This service is responsible for:
 * - Downloading videos from URLs
 * - Extracting audio from videos
 * - Processing and storing media files
 * - Providing APIs for media access and conversion
 */
export default new Service("media");
