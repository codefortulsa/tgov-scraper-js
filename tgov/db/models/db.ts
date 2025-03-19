// DO NOT EDIT — Auto-generated file; see https://github.com/mogzol/prisma-generator-typescript-interfaces

export type CommitteeModel = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  meetingRecords?: MeetingRecordModel[];
};

export type MeetingRecordModel = {
  id: string;
  name: string;
  startedAt: Date;
  endedAt: Date;
  createdAt: Date;
  updatedAt: Date;
  committeeId: string;
  videoViewUrl: string | null;
  agendaViewUrl: string | null;
  rawJson: JsonValue;
  videoId: string | null;
  audioId: string | null;
  agendaId: string | null;
};

type JsonValue =
  | string
  | number
  | boolean
  | { [key in string]: JsonValue }
  | Array<JsonValue>
  | null;
