// import { TaskType } from "../db";

// const MEDIA_TASK_TYPES = [
//   TaskType.VIDEO_DOWNLOAD,
//   TaskType.VIDEO_PROCESS,
//   TaskType.AUDIO_EXTRACT,
// ] satisfies Array<string> & { length: 3 };

// const DOCUMENT_TASK_TYPES = [
//   TaskType.DOCUMENT_DOWNLOAD,
//   TaskType.DOCUMENT_CONVERT,
//   TaskType.DOCUMENT_EXTRACT,
//   TaskType.DOCUMENT_PARSE,
//   TaskType.AGENDA_DOWNLOAD,
// ] satisfies Array<string> & { length: 5 };

// const GENERATION_TASK_TYPES = [
//   TaskType.AUDIO_TRANSCRIBE,
//   TaskType.SPEAKER_DIARIZE,
//   TaskType.TRANSCRIPT_FORMAT,
// ] satisfies Array<string> & { length: 3 };

// type In<T extends any[]> = T[number];

// const is = <A extends any[]>(arr: A) => arr.includes as (v: any) => v is In<A>;

// export const isMediaTaskType = is(MEDIA_TASK_TYPES);
// export const isDocumentTaskType = is(DOCUMENT_TASK_TYPES);
// export const isTranscriptionTaskType = is(GENERATION_TASK_TYPES);

// export type MediaTaskType = In<typeof MEDIA_TASK_TYPES>;
// export type DocumentTaskType = In<typeof DOCUMENT_TASK_TYPES>;
// export type TranscriptionTaskType = In<typeof GENERATION_TASK_TYPES>;
