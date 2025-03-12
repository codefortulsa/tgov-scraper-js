
// import fs from 'fs';
// import path from 'path';
// import { TranscriptionResult } from './interfaces';


export interface TranscriptionResult {
  meetingId: number;
  transcription: string;
}


// // Replace with your actual Gemini API endpoint and key.
// const GEMINI_API_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent';
// const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

// const TRANSCRIPTION_PROMPT = "Transcribe the audio accurately. Include speaker cues and timestamps if available.";

// /**
//  * Submits a single audio file to the Gemini API for transcription.
//  * Adjust the payload as per the API reference.
//  *
//  * @param audioFilePath - The path to the audio file.
//  * @param meetingId - The meeting ID to tie back the result.
//  * @returns A Promise resolving to a transcription result.
//  */
// async function transcribeAudio(audioFilePath: string, meetingId: number): Promise<TranscriptionResult> {
//   // Read the audio file
//   const audioData = fs.createReadStream(audioFilePath);

//   // Create form data payload
//   const formData = new FormData();
//   formData.append('audio', audioData, {
//     filename: path.basename(audioFilePath),
//   });
  
//   formData.append('prompt', TRANSCRIPTION_PROMPT);

//   const response = await fetch(GEMINI_API_ENDPOINT + `?key=${GEMINI_API_KEY}`, {
//     method: 'POST',
//     headers: formData.getHeaders(),
//     body: formData.getBuffer(),
//   }).catch((error) => {
//     throw new Error(`Failed to submit audio for transcription: ${error.message}`);
//   });

//   if (!response.ok) {
//     throw new Error(`Transcription request failed with
//       status ${response.status}: ${await response.text()}`);
//   }

//   const json = await response.json();

//   const { transcription } = json
  
//   // Assuming the response returns a field 'transcription' (adjust based on actual docs)
//   return {
//     meetingId,
//     transcription: transcription || '',
//   };
// }

// /**
//  * Batches transcribe multiple audio files.
//  *
//  * @param audioFilePaths - Array of audio file paths.
//  * @returns A Promise resolving to an array of transcription results.
//  */
// export async function batchTranscribe(audioFilePaths: { path: string; meetingId: number }[]): Promise<TranscriptionResult[]> {
//   const results: TranscriptionResult[] = [];
//   // For cost-effectiveness, process in batches (here sequentially; adapt with Promise.all if safe)
//   for (const { path: audioPath, meetingId } of audioFilePaths) {
//     try {
//       const result = await transcribeAudio(audioPath, meetingId);
//       results.push(result);
//     } catch (error: any) {
//       results.push({ meetingId, transcription: `Error: ${error.message}` });
//     }
//   }
//   return results;
// }
