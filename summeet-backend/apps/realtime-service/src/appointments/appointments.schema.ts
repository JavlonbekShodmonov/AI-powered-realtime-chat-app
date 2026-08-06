import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

@Schema({ timestamps: true })
export class Appointment extends Document {
  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  startTime: Date;

  @Prop({ required: true })
  platform: string; // e.g., 'Zoom', 'Google Meet', 'MS Teams'

  @Prop({ required: true })
  meetingUrl: string; // Redirect URL to external call

  @Prop({ type: [String], default: [] })
  invitedUsers: string[];
}

export const AppointmentSchema = SchemaFactory.createForClass(Appointment);