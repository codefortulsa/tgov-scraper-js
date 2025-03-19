export type MeetingRawJSON = TGovIndexMeetingRawJSON;

export type TGovIndexMeetingRawJSON = {
  committee: string;
  name: string;
  date: string;
  duration: string;
  viewId: string;
  clipId?: string;
  agendaViewUrl: string | undefined;
  videoViewUrl: string | undefined;
};
