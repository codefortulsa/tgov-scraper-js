import fs from "fs";

import { TranscriptionSegment } from "./index";

import logger from "encore.dev/log";

import OpenAI from "openai/index.js";

export interface WhisperClientOptions {
  apiKey: string;
  defaultModel?: string;
}

export interface WhisperTranscriptionOptions {
  model?: string;
  language?: string;
  responseFormat?: "json" | "text" | "srt" | "verbose_json" | "vtt";
  prompt?: string;
  temperature?: number;
}

export interface WhisperResponse {
  text: string;
  language?: string;
  segments?: TranscriptionSegment[];
  duration?: number;
}

/**
 * Client for interacting with OpenAI's Whisper API for audio transcription
 */
export class WhisperClient {
  private client: OpenAI;
  private defaultModel: string;

  /**
   * Create a new WhisperClient instance
   *
   * @param options Configuration options for the client
   */
  constructor(options: WhisperClientOptions) {
    if (!options.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.client = new OpenAI({
      apiKey: options.apiKey,
    });
    this.defaultModel = options.defaultModel || "whisper-1";

    logger.info("WhisperClient initialized", {
      model: this.defaultModel,
    });
  }

  /**
   * Transcribe an audio file using the OpenAI Whisper API
   *
   * @param audioFilePath Path to the audio file
   * @param options Transcription options
   * @returns Transcription result
   */
  async transcribeFile(
    audioFilePath: string,
    options: WhisperTranscriptionOptions = {},
  ): Promise<WhisperResponse> {
    const startTime = Date.now();

    if (!fs.existsSync(audioFilePath)) {
      throw new Error(`Audio file not found: ${audioFilePath}`);
    }

    const fileSize = fs.statSync(audioFilePath).size;
    logger.info("Starting transcription", {
      audioFilePath,
      fileSize,
      model: options.model || this.defaultModel,
      language: options.language,
    });

    const fileStream = fs.createReadStream(audioFilePath);

    try {
      const response = await this.client.audio.transcriptions.create({
        file: fileStream,
        model: options.model || this.defaultModel,
        language: options.language,
        response_format: options.responseFormat || "verbose_json",
        prompt: options.prompt,
        temperature: options.temperature,
      });

      const processingTime = (Date.now() - startTime) / 1000;
      logger.info("Transcription completed", {
        processingTime,
        model: options.model || this.defaultModel,
      });

      if (
        options.responseFormat === "verbose_json" ||
        options.responseFormat === undefined
      ) {
        // Cast to any since the OpenAI types don't include the verbose_json format
        const verboseResponse = response as any;

        return {
          text: verboseResponse.text,
          language: verboseResponse.language,
          duration: verboseResponse.duration,
          segments: verboseResponse.segments.map(
            (segment: any, index: number) => ({
              index,
              start: segment.start,
              end: segment.end,
              text: segment.text,
              confidence: segment.confidence,
            }),
          ),
        };
      }

      return {
        text: response.text,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error("Error transcribing file", {
        audioFilePath,
        error: errorMessage,
        model: options.model || this.defaultModel,
      });
      throw error;
    } finally {
      fileStream.destroy();
    }
  }
}
