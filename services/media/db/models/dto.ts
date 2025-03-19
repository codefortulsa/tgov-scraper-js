// DO NOT EDIT — Auto-generated file; see https://github.com/mogzol/prisma-generator-typescript-interfaces

export type MediaFileDto = {
  id: string;
  bucket: string;
  key: string;
  mimetype: string;
  url: string | null;
  srcUrl: string | null;
  createdAt: string;
  updatedAt: string;
  meetingRecordId: string | null;
  title: string | null;
  description: string | null;
  fileSize: number | null;
};

export type VideoProcessingBatchDto = {
  id: string;
  status: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  createdAt: string;
  updatedAt: string;
};

export type VideoProcessingTaskDto = {
  id: string;
  viewerUrl: string | null;
  downloadUrl: string | null;
  status: string;
  extractAudio: boolean;
  error: string | null;
  createdAt: string;
  updatedAt: string;
  batchId: string | null;
  meetingRecordId: string | null;
  videoId: string | null;
  audioId: string | null;
};
