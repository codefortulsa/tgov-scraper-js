import { exec as execCallback } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { TranscriptionSegment } from "./index";

import logger from "encore.dev/log";

import OpenAI from "openai/index.js";

const exec = promisify(execCallback);

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

// Size in bytes (25MB - 1MB buffer to be safe)
const MAX_FILE_SIZE = 24 * 1024 * 1024;
// Default chunk duration in seconds (10 minutes)
const DEFAULT_CHUNK_DURATION = 10 * 60;

/**
 * Client for interacting with OpenAI's Whisper API for audio transcription
 */
export class WhisperClient {
  #client: OpenAI;
  #defaultModel: string;

  /**
   * Create a new WhisperClient instance
   *
   * @param options Configuration options for the client
   */
  constructor(options: WhisperClientOptions) {
    if (!options.apiKey) {
      throw new Error("OpenAI API key is required");
    }

    this.#client = new OpenAI({
      apiKey: options.apiKey,
    });
    this.#defaultModel = options.defaultModel || "whisper-1";

    logger.info("WhisperClient initialized", {
      model: this.#defaultModel,
    });
  }

  /**
   * Transcribe an audio file using the OpenAI Whisper API
   * If file size exceeds the maximum allowed, it will be chunked
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
      model: options.model || this.#defaultModel,
      language: options.language,
    });

    // If file is smaller than the maximum size, transcribe directly
    if (fileSize <= MAX_FILE_SIZE) {
      return this.#transcribeChunk(audioFilePath, options);
    }

    // For larger files, split into chunks and process sequentially
    logger.info("File exceeds maximum size, splitting into chunks", {
      audioFilePath,
      fileSize,
      maxSize: MAX_FILE_SIZE,
    });

    return this.#transcribeWithChunking(audioFilePath, options);
  }

  /**
   * Transcribe a single chunk of audio
   *
   * @param chunkPath Path to the audio chunk
   * @param options Transcription options
   * @returns Transcription result
   */
  async #transcribeChunk(
    chunkPath: string,
    options: WhisperTranscriptionOptions = {},
  ): Promise<WhisperResponse> {
    const fileStream = fs.createReadStream(chunkPath);

    try {
      const response = await this.#client.audio.transcriptions.create({
        file: fileStream,
        model: options.model || this.#defaultModel,
        language: options.language,
        response_format: options.responseFormat || "verbose_json",
        prompt: options.prompt,
        temperature: options.temperature,
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
      logger.error("Error transcribing chunk", {
        chunkPath,
        error: errorMessage,
        model: options.model || this.#defaultModel,
      });
      throw error;
    } finally {
      fileStream.destroy();
    }
  }

  /**
   * Split an audio file into smaller chunks and transcribe them sequentially
   *
   * @param audioFilePath Path to the audio file
   * @param options Transcription options
   * @returns Combined transcription result
   */
  async #transcribeWithChunking(
    audioFilePath: string,
    options: WhisperTranscriptionOptions = {},
  ): Promise<WhisperResponse> {
    const startTime = Date.now();
    const tempDir = path.dirname(audioFilePath);
    const fileName = path.basename(audioFilePath, path.extname(audioFilePath));

    // Get audio duration using ffprobe
    const { audioDuration, audioInfo } =
      await this.#getAudioInfo(audioFilePath);

    logger.info("Audio file information", {
      audioDuration,
      audioInfo,
    });

    // Calculate optimal chunk size based on file size and duration
    const chunkDuration = this.#calculateChunkDuration(
      audioFilePath,
      audioDuration,
    );
    const totalChunks = Math.ceil(audioDuration / chunkDuration);

    logger.info("Splitting audio into chunks", {
      totalChunks,
      chunkDuration,
      audioDuration,
    });

    // Create chunks
    const chunkFiles: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const startOffset = i * chunkDuration;
      const chunkPath = path.join(tempDir, `${fileName}_chunk${i + 1}.mp3`);
      chunkFiles.push(chunkPath);

      await this.#extractAudioChunk(
        audioFilePath,
        chunkPath,
        startOffset,
        chunkDuration,
      );

      logger.info(`Created chunk ${i + 1}/${totalChunks}`, {
        chunkPath,
        startOffset,
        duration: chunkDuration,
      });
    }

    // Process each chunk sequentially with context from previous chunk
    let combinedResult: WhisperResponse = {
      text: "",
      segments: [],
      duration: 0,
    };

    let previousText = "";

    try {
      for (let i = 0; i < chunkFiles.length; i++) {
        logger.info(`Processing chunk ${i + 1}/${chunkFiles.length}`);

        // Add context from previous chunk to improve continuity
        const chunkOptions = { ...options };
        if (i > 0 && previousText) {
          // Use last few sentences from previous chunk as prompt for context
          const contextText = this.#extractContextFromText(previousText);
          chunkOptions.prompt = contextText;
          logger.debug("Using context for chunk", {
            contextLength: contextText.length,
          });
        }

        // Transcribe the current chunk
        const chunkResult = await this.#transcribeChunk(
          chunkFiles[i],
          chunkOptions,
        );
        previousText = chunkResult.text;

        // Adjust segment timings for subsequent chunks
        const timeOffset = i * chunkDuration;
        if (chunkResult.segments && chunkResult.segments.length > 0) {
          chunkResult.segments.forEach((segment) => {
            segment.start += timeOffset;
            segment.end += timeOffset;
          });
        }

        // Merge results
        combinedResult.text += (i > 0 ? " " : "") + chunkResult.text;
        combinedResult.language =
          chunkResult.language || combinedResult.language;
        combinedResult.duration =
          (combinedResult.duration || 0) + (chunkResult.duration || 0);

        if (chunkResult.segments && chunkResult.segments.length > 0) {
          const baseIndex = combinedResult.segments?.length || 0;
          const adjustedSegments = chunkResult.segments.map((segment, idx) => ({
            ...segment,
            index: baseIndex + idx,
          }));

          combinedResult.segments = [
            ...(combinedResult.segments || []),
            ...adjustedSegments,
          ];
        }
      }

      const processingTime = (Date.now() - startTime) / 1000;
      logger.info("Chunked transcription completed", {
        processingTime,
        chunks: chunkFiles.length,
        totalText: combinedResult.text.length,
        totalSegments: combinedResult.segments?.length || 0,
      });

      return combinedResult;
    } finally {
      // Clean up chunk files
      for (const chunkFile of chunkFiles) {
        try {
          fs.unlinkSync(chunkFile);
        } catch (error) {
          logger.warn(`Failed to delete chunk file: ${chunkFile}`, { error });
        }
      }
    }
  }

  /**
   * Get audio file duration and information using ffprobe
   */
  async #getAudioInfo(
    filePath: string,
  ): Promise<{ audioDuration: number; audioInfo: string }> {
    try {
      const { stdout } = await exec(
        `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`,
      );

      const audioDuration = parseFloat(stdout.trim());

      // Get more detailed info for debugging
      const { stdout: infoStdout } = await exec(
        `ffprobe -v error -show_entries format=size,duration,bit_rate -show_entries stream=codec_name,sample_rate,channels -of default=noprint_wrappers=1 "${filePath}"`,
      );

      return {
        audioDuration: isNaN(audioDuration) ? 0 : audioDuration,
        audioInfo: infoStdout.trim(),
      };
    } catch (error) {
      logger.error("Failed to get audio duration", { error });
      return { audioDuration: 0, audioInfo: "Unknown" };
    }
  }

  /**
   * Calculate optimal chunk duration based on file size and duration
   */
  #calculateChunkDuration(filePath: string, totalDuration: number): number {
    if (totalDuration <= 0) return DEFAULT_CHUNK_DURATION;

    const fileSize = fs.statSync(filePath).size;
    const bytesPerSecond = fileSize / totalDuration;

    // Calculate how many seconds fit into MAX_FILE_SIZE with a 10% safety margin
    const maxChunkDuration = Math.floor((MAX_FILE_SIZE * 0.9) / bytesPerSecond);

    // Ensure reasonable chunk size between 5-15 minutes
    return Math.max(5 * 60, Math.min(15 * 60, maxChunkDuration));
  }

  /**
   * Extract a chunk of audio from the source file using ffmpeg
   */
  async #extractAudioChunk(
    sourcePath: string,
    outputPath: string,
    startOffset: number,
    duration: number,
  ): Promise<void> {
    try {
      await exec(
        `ffmpeg -y -i "${sourcePath}" -ss ${startOffset} -t ${duration} -c:a libmp3lame -q:a 4 "${outputPath}"`,
      );
    } catch (error) {
      logger.error("Failed to extract audio chunk", {
        sourcePath,
        outputPath,
        startOffset,
        duration,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Extract context from previous chunk's text
   * Gets the last few sentences to provide context for the next chunk
   */
  #extractContextFromText(text: string): string {
    // Get approximately the last 100-200 words as context
    const words = text.split(/\s+/);
    const contextWords = words.slice(Math.max(0, words.length - 150));

    // Try to find sentence boundaries for cleaner context
    const contextText = contextWords.join(" ");

    // Find the first capital letter after a period to start at a sentence boundary if possible
    const sentenceBoundaryMatch = contextText.match(/\.\s+[A-Z]/);
    if (
      sentenceBoundaryMatch &&
      sentenceBoundaryMatch.index &&
      sentenceBoundaryMatch.index > 20
    ) {
      return contextText.substring(sentenceBoundaryMatch.index + 2);
    }

    return contextText;
  }
}
