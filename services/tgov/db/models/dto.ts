export type CommitteeDto = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type MeetingRecordDto = {
  id: string;
  name: string;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  updatedAt: string;
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
  | {}
  | Array<JsonValue>
  | null;
