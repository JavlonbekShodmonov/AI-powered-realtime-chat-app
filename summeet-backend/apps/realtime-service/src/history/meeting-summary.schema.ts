import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

@Schema({ timestamps: true })
export class MeetingSummary extends Document {
  @Prop({ required: true, type: MongooseSchema.Types.ObjectId, ref: 'Appointment' })
  meetingId: string;

  @Prop({ required: true })
  userId: string;

  @Prop({ type: [String], default: [] })
  topics: string[];

  @Prop({ type: [String], default: [] })
  decisions: string[];

  @Prop({
    type: [{ owner: String, task: String }],
    default: [],
  })
  actionItems: { owner: string; task: string }[];

  @Prop({ type: Map, of: Number, default: {} })
  participation: Record<string, number>; // e.g., { "User1": 60, "User2": 40 }
}

export const MeetingSummarySchema = SchemaFactory.createForClass(MeetingSummary);

// Enables rapid, free text-based search queries across topics, decisions, and tasks
MeetingSummarySchema.index({
  topics: 'text',
  decisions: 'text',
  'actionItems.task': 'text',
  'actionItems.owner': 'text',
});