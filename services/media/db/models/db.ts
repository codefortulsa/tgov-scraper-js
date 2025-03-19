// DO NOT EDIT — Auto-generated file; see https://github.com/mogzol/prisma-generator-typescript-interfaces

export type MediaFileModel = {
  id: string;
  bucket: string;
  key: string;
  mimetype: string;
  url: string | null;
  srcUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
  meetingRecordId: string | null;
  title: string | null;
  description: string | null;
  fileSize: number | null;
  videoProcessingTaskVideos?: VideoProcessingTaskModel[];
  videoProcessingTaskAudios?: VideoProcessingTaskModel[];
};

export type VideoProcessingBatchModel = {
  id: string;
  status: string;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  createdAt: Date;
  updatedAt: Date;
  tasks?: VideoProcessingTaskModel[];
};

export type VideoProcessingTaskModel = {
  id: string;
  viewerUrl: string | null;
  downloadUrl: string | null;
  status: string;
  extractAudio: boolean;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
  batchId: string | null;
  meetingRecordId: string | null;
  videoId: string | null;
  audioId: string | null;
  batch?: VideoProcessingBatchModel | null;
  video?: MediaFileModel | null;
  audio?: MediaFileModel | null;
};
