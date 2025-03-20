// filepath: /Users/alec/dev/punctuil/services/tulsa-transcribe/services/transcription/phi4Client.ts
import { exec as execCallback } from "child_process";
import fs from "fs";
import path from "path";
import { promisify } from "util";

import { SpeakerModel, TranscriptionSegmentModel } from "./db/models/db";
import { TranscriptionSegment } from "./index";

import logger from "encore.dev/log";

const exec = promisify(execCallback);

type JsonValue =
  | string
  | number
  | boolean
  | { [key: string]: JsonValue }
  | Array<JsonValue>
  | null;

export interface Phi4ClientOptions {
  apiKey: string;
  apiEndpoint?: string;
}

export interface Phi4DiarizationOptions {
  minSpeakers?: number;
  maxSpeakers?: number;
  videoPath?: string;
  audioPath?: string;
  transcriptionSegments?: TranscriptionSegment[];
  language?: string;
}

export interface Phi4DiarizationResponse {
  speakers: SpeakerModel[];
  segments: TranscriptionSegmentModel[];
}

// export interface Speaker {
//   id: string;
//   label: string;
//   name?: string;
//   notes?: { [key: string]: JsonValue };
// }

/**
 * Client for interacting with Microsoft's Phi-4 model for speaker diarization
 */
export class Phi4Client {
  #apiKey: string;
  #apiEndpoint: string;

  /**
   * Create a new Phi4Client instance
   *
   * @param options Configuration options for the client
   */
  constructor(options: Phi4ClientOptions) {
    if (!options.apiKey) {
      throw new Error("Microsoft API key is required");
    }

    this.#apiKey = options.apiKey;
    this.#apiEndpoint =
      options.apiEndpoint || "https://api.microsoft.com/v1/phi4";

    logger.info("Phi4Client initialized");
  }

  /**
   * Extract audio from video file if needed
   *
   * @param videoPath Path to the video file
   * @returns Path to the extracted audio file
   */
  async extractAudioFromVideo(videoPath: string): Promise<string> {
    const audioPath = path.join(
      path.dirname(videoPath),
      `${path.basename(videoPath, path.extname(videoPath))}.mp3`,
    );

    try {
      await exec(
        `ffmpeg -y -i "${videoPath}" -vn -acodec libmp3lame -q:a 4 "${audioPath}"`,
      );
      logger.info("Extracted audio from video", {
        videoPath,
        audioPath,
      });
      return audioPath;
    } catch (error) {
      logger.error("Failed to extract audio from video", {
        videoPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Perform speaker diarization on audio using Phi-4 model
   *
   * @param options Diarization options
   * @returns Diarization response with speakers and segments
   */
  async diarizeAudio(
    options: Phi4DiarizationOptions,
  ): Promise<Phi4DiarizationResponse> {
    let audioPath = options.audioPath;

    // If video path is provided but audio path isn't, extract audio first
    if (options.videoPath && !audioPath) {
      audioPath = await this.extractAudioFromVideo(options.videoPath);
    }

    if (!audioPath) {
      throw new Error("Either audioPath or videoPath must be provided");
    }

    if (
      !options.transcriptionSegments ||
      options.transcriptionSegments.length === 0
    ) {
      throw new Error("Transcription segments are required for diarization");
    }

    try {
      // Create diarization prompt for Phi-4
      const diarizationPrompt = this.#createDiarizationPrompt(
        audioPath,
        options.transcriptionSegments,
        options.minSpeakers,
        options.maxSpeakers,
        options.language,
      );

      // Process with Phi-4 model
      const result = await this.#processDiarizationWithPhi4(diarizationPrompt);

      return this.#parseDiarizationResult(
        result,
        options.transcriptionSegments,
      );
    } catch (error) {
      logger.error("Failed to diarize audio", {
        audioPath,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create a prompt for Phi-4 to perform diarization
   */
  #createDiarizationPrompt(
    audioPath: string,
    segments: TranscriptionSegment[],
    minSpeakers?: number,
    maxSpeakers?: number,
    language?: string,
  ): string {
    // Extract audio features or use segment info for diarization prompt
    const transcriptText = segments.map((s) => s.text).join(" ");
    const segmentInfo = segments
      .map((s) => `[${s.start.toFixed(2)}s - ${s.end.toFixed(2)}s]: ${s.text}`)
      .join("\n");

    // Create system prompt for Phi-4
    return `You are an expert in speaker diarization. Analyze the following transcript and assign speakers to each segment.
Audio file information: ${audioPath}
Language: ${language || "unknown"}
${minSpeakers !== undefined ? `Minimum number of speakers: ${minSpeakers}` : ""}
${maxSpeakers !== undefined ? `Maximum number of speakers: ${maxSpeakers}` : ""}

Complete transcript:
${transcriptText}

Transcript segments:
${segmentInfo}

Identify each unique speaker in the transcript. For each segment, determine which speaker is talking.
Respond with a JSON object containing:
1. A "speakers" array with {id, label, name (if identifiable)} for each speaker
2. A "segments" array with the original segment data plus speakerId assigned

Use acoustic features, speaker style, context, and addressing patterns to differentiate speakers.`;
  }

  /**
   * Process diarization with Phi-4 model by making API request
   */
  async #processDiarizationWithPhi4(prompt: string): Promise<string> {
    try {
      const requestBody = {
        model: "phi-4",
        messages: [
          {
            role: "system",
            content:
              "You are a speaker diarization assistant that only responds with valid JSON.",
          },
          { role: "user", content: prompt },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      };

      const response = await fetch(this.#apiEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.#apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        throw new Error(
          `Phi-4 API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const responseData = await response.json();
      return responseData.choices[0].message.content;
    } catch (error) {
      logger.error("Error calling Phi-4 API", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error(
        `Failed to process with Phi-4: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Parse the diarization result from Phi-4
   */
  #parseDiarizationResult(
    result: string,
    originalSegments: TranscriptionSegment[],
  ): Phi4DiarizationResponse {
    try {
      // Parse the JSON response
      const parsedResult = JSON.parse(result);

      // Validate required fields
      if (
        !parsedResult.speakers ||
        !Array.isArray(parsedResult.speakers) ||
        !parsedResult.segments ||
        !Array.isArray(parsedResult.segments)
      ) {
        throw new Error("Invalid diarization result format");
      }

      // Process speakers
      const speakers = parsedResult.speakers.map((speaker: any) => ({
        id: speaker.id,
        label: speaker.label,
        name: speaker.name || undefined,
      }));

      // Process segments with speaker IDs
      const segments = parsedResult.segments.map(
        (segment: any, index: number) => {
          // Ensure we don't go out of bounds with the original segments
          const origSegment =
            originalSegments[Math.min(index, originalSegments.length - 1)];

          return {
            ...origSegment,
            speakerId: segment.speakerId || speakers[0]?.id, // Fallback to first speaker if not specified
          };
        },
      );

      return { speakers, segments };
    } catch (error) {
      logger.error("Failed to parse diarization result", {
        result,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new Error("Failed to parse diarization result");
    }
  }
}
