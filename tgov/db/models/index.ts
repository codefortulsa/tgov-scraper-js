import * as Db from "./db";
import * as Dto from "./dto";
import * as Json from "./json";

export { Json, Dto, Db };
export default { Json, Dto, Db };

declare global {
  namespace PrismaJson {
    export type MeetingRawJSON = Json.MeetingRawJSON;
  }
}
