import { Service } from "encore.dev/service";

/**
 * Transcription service for converting audio to text
 * 
 * This service is responsible for:
 * - Converting audio files to text using the Whisper API
 * - Storing and retrieving transcriptions
 * - Managing the transcription workflow
 */
export default new Service("transcription");