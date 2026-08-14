import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { InjectRedis } from "@nestjs-modules/ioredis";
import Redis from "ioredis";
import * as webpush from "web-push";
import { Logger } from "@nestjs/common";
import { RealtimeGateway } from "./realtime.gateway";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { MeetingSummary } from "../history/meeting-summary.schema";

@Processor("notification-queue", {
  drainDelay: 300,
  stalledInterval: 120000,
})
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    @InjectRedis() private readonly redis: Redis,
    private readonly realtimeGateway: RealtimeGateway,
    @InjectModel(MeetingSummary.name)
    private readonly summaryModel: Model<MeetingSummary>,
  ) {
    super();

    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (!publicKey || !privateKey) {
      throw new Error(
        "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set — refusing to start with no push credentials.",
      );
    }
    webpush.setVapidDetails(
      "mailto:mohiiish.com@gmail.com",
      publicKey,
      privateKey,
    );
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { name, data } = job;

    switch (name) {
      case "appointment-created":
        return this.handleAppointmentNotification(data, "New Appointment");
      case "appointment-updated":
        return this.handleAppointmentNotification(data, "Appointment Updated");
      case "send-realtime-alert":
        return this.handleRealtimeAlert(data);
      default:
        throw new Error(`Unknown job pattern layout: ${name}`);
    }
  }

  private async handleRealtimeAlert(data: any) {
    const { roomId, userId, type, payload } = data;
    this.logger.log(
      `Dispatching realtime alert: ${type} (room=${roomId}, user=${userId})`,
    );

    if (type === "SUMMARY_COMPLETED") {
      const target = userId ? `user:${userId}` : roomId;
      this.realtimeGateway.server.to(target).emit("summary-finished", {
        success: true,
        userId: userId || null,
        fullSummary: payload.fullSummary,
        userSummary: payload.userSummary,
        language: payload.detectedLanguage,
        participation: payload.participation,
      });

      if (userId) {
        await this.sendPushIfOffline(userId, {
          title: "Summary ready",
          body: payload.userSummary
            ? "Your summary is ready to view."
            : "Your meeting summary is ready to view.",
          url: `/meeting/${roomId}`,
        });
      }
      return { dispatched: true };
    }

    if (type === "suggestions-ready") {
      if (userId) {
        this.realtimeGateway.server
          .to(`user:${userId}`)
          .emit("suggestions-ready", {
            success: true,
            suggestions: payload.suggestions,
            note: payload.note,
          });

        await this.sendPushIfOffline(userId, {
          title: "Suggestions ready",
          body: "New reply suggestions are ready.",
          url: `/meeting/${roomId}`,
        });
      }
      return { dispatched: true };
    }

    if (type === "WEEKLY_DIGEST") {
      const oneWeekAgo = new Date();
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

      const summaries = await this.summaryModel.find({
        userId,
        createdAt: { $gte: oneWeekAgo },
      });

      const totalMeetings = summaries.length;
      const totalActionItems = summaries.reduce(
        (acc, curr) => acc + (curr.actionItems?.length || 0),
        0,
      );

      if (userId) {
        await this.sendPushIfOffline(userId, {
          title: "Your weekly SumMeet digest",
          body: `You completed ${totalMeetings} meeting${totalMeetings === 1 ? "" : "s"} this week, with ${totalActionItems} action item${totalActionItems === 1 ? "" : "s"} assigned.`,
          url: `/history`,
        });
      }
      return { dispatched: true };
    }

    this.logger.warn(`Unhandled realtime alert type: ${type}`);
    return { dispatched: false };
  }

  private async sendPushIfOffline(
    userId: string,
    notification: { title: string; body: string; url: string },
  ) {
    const presenceRaw = await this.redis.hget("user:presence", userId);
    if (presenceRaw) return; // user is online — 1 command, done, no push needed

    const subscriptionRaw = await this.redis.get(`user:subscription:${userId}`);
    if (!subscriptionRaw) return;

    try {
      const subscription = JSON.parse(subscriptionRaw);
      const payload = JSON.stringify({
        title: notification.title,
        body: notification.body,
        icon: "/favicon.avif",
        data: { url: notification.url },
      });
      await webpush.sendNotification(subscription, payload);
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        await this.redis.del(`user:subscription:${userId}`);
      }
    }
  }

  private async handleAppointmentNotification(appointment: any, title: string) {
    const creatorName = appointment.createdByName || "Someone";

    const usersToNotify = new Set<string>([
      String(appointment.createdBy),
      ...(appointment.withUserId || []).map((id: any) => String(id)),
    ]);

    const eventName =
      title === "New Appointment" ? "newAppointment" : "appointment:updated";
    this.realtimeGateway.server.emit(eventName, appointment);

    for (const userId of usersToNotify) {
      const presenceRaw = await this.redis.hget("user:presence", userId);
      if (presenceRaw) continue; // online — socket already got it via server.emit above, skip push

      const subscriptionRaw = await this.redis.get(
        `user:subscription:${userId}`,
      );
      if (!subscriptionRaw) continue;

      try {
        const subscription = JSON.parse(subscriptionRaw);
        const payload = JSON.stringify({
          title,
          body:
            title === "New Appointment"
              ? `${creatorName} scheduled an appointment at ${new Date(appointment.scheduledAt).toLocaleString()}`
              : `${creatorName}'s appointment is now ${appointment.status}`,
          icon: "/favicon.avif",
          data: {
            appointmentId: appointment._id,
            url: `/meeting/${appointment._id}`,
          },
        });
        await webpush.sendNotification(subscription, payload);
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await this.redis.del(`user:subscription:${userId}`);
        }
      }
    }
  }
}
