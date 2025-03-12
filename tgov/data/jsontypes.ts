declare global {
  namespace PrismaJson {
    type MeetingRawJSON = TGovIndexMeetingRawJSON;

    type TGovIndexMeetingRawJSON = {
      committee: string;
      name: string;
      date: string;
      duration: string;
      viewId: string;
      clipId?: string;
      agendaViewUrl: string | undefined;
      videoViewUrl: string | undefined;
    };

    type ErrorListJSON = Array<{
      name: string;
      message: string;
      stack?: string;
    }>;
  }
}

export {};
