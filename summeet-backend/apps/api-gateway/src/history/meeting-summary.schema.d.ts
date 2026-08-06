import { Document, Schema as MongooseSchema } from 'mongoose';
export declare class MeetingSummary extends Document {
    meetingId: string;
    userId: string;
    topics: string[];
    decisions: string[];
    actionItems: {
        owner: string;
        task: string;
    }[];
    participation: Record<string, number>;
}
export declare const MeetingSummarySchema: MongooseSchema<MeetingSummary, import("mongoose").Model<MeetingSummary, any, any, any, Document<unknown, any, MeetingSummary, any, {}> & MeetingSummary & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}, any>, {}, {}, {}, {}, import("mongoose").DefaultSchemaOptions, MeetingSummary, Document<unknown, {}, import("mongoose").FlatRecord<MeetingSummary>, {}, import("mongoose").DefaultSchemaOptions> & import("mongoose").FlatRecord<MeetingSummary> & Required<{
    _id: import("mongoose").Types.ObjectId;
}> & {
    __v: number;
}>;
