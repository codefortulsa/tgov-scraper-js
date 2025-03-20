// DO NOT EDIT — Auto-generated file; see https://github.com/mogzol/prisma-generator-typescript-interfaces

export type TranscriptionDto = {
  id: string;
  text: string;
  language: string | null;
  model: string;
  confidence: number | null;
  processingTime: number | null;
  status: string;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  diarized: boolean;
  audioFileId: string;
  meetingRecordId: string | null;
  segments?: TranscriptionSegmentDto[];
  speakers?: SpeakerDto[];
};

export type TranscriptionSegmentDto = {
  id: string;
  index: number;
  start: number;
  end: number;
  text: string;
  confidence: number | null;
  speakerId: string | null;
  transcriptionId: string;
  transcription?: TranscriptionDto;
  speaker?: SpeakerDto | null;
};

export type SpeakerDto = {
  id: string;
  label: string;
  name: string | null;
  transcriptionId: string;
  transcription?: TranscriptionDto;
  segments?: TranscriptionSegmentDto[];
};

export type TranscriptionJobDto = {
  id: string;
  status: string;
  priority: number;
  model: string;
  language: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  enableDiarization: boolean;
  diarizationModel: string | null;
  audioFileId: string;
  meetingRecordId: string | null;
  transcriptionId: string | null;
};
