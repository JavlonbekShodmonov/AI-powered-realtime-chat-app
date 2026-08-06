import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type MeetingSummaryDocument = MeetingSummary & Document;

@Schema({ collection: 'meeting_summaries', timestamps: true })
export class MeetingSummary {
  @Prop({ required: true })
  meetingId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ type: [String], default: [] })
  topics: string[];

  @Prop({ type: [String], default: [] })
  decisions: string[];

  @Prop({ type: [String], default: [] })
  actionItems: string[];

  @Prop({ type: [Object], default: [] })
  participation: Record<string, any>[];
}

export const MeetingSummarySchema = SchemaFactory.createForClass(MeetingSummary);
