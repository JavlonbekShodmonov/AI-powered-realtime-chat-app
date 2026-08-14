import { Processor, WorkerHost, InjectQueue } from "@nestjs/bullmq";
import { Job, Queue } from "bullmq";
import { InjectModel } from "@nestjs/mongoose";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { Model } from "mongoose";
import { MongoClient, ObjectId, Db } from "mongodb";
import { AIService } from "./ai.service";
import { MeetingSummary } from "../history/meeting-summary.schema";
import { SpeechTranscriptsService } from "./speech-transcripts.service";
// concurrency: 5 mirrors the old MAX_CONCURRENT_REQUESTS limiter in
// suggest-response/route.ts, which capped how many Gemini calls could be
// in flight at once. That limiter didn't carry over in the migration —
// without it, a burst of jobs will fire unlimited concurrent Gemini calls.
// If you already tune concurrency elsewhere (e.g. in the BullMQ Worker
// options at bootstrap), keep them in sync rather than setting it in two places.
@Processor("ai-tasks", {
  concurrency: 5,
  drainDelay: 300,
  stalledInterval: 120000,
})
export class AIProcessor extends WorkerHost {
  private mongoClient: MongoClient;
  private db: Db;

  constructor(
    private readonly aiService: AIService,
    private readonly speechTranscriptsService: SpeechTranscriptsService,
    @InjectModel(MeetingSummary.name)
    private readonly summaryModel: Model<MeetingSummary>,
    private readonly eventEmitter: EventEmitter2,
    @InjectQueue("notification-queue")
    private readonly notificationQueue: Queue,
  ) {
    super();
    this.mongoClient = new MongoClient(process.env.MONGODB_URI || "");
  }

  private async getDb(): Promise<Db> {
    if (!this.db) {
      await this.mongoClient.connect();
      this.db = this.mongoClient.db();
    }
    return this.db;
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name === "summarize-meeting" && job.data?.transcript) {
      return this.handleStructuredSummarization(job);
    }

    if (job.name === "summarize" || job.name === "summarize-meeting") {
      return this.handleSummarize(job.data);
    }

    if (job.name === "suggest-response") {
      return this.handleSuggestion(job.data);
    }

    return { status: "ignored", jobName: job.name };
  }

  private async handleStructuredSummarization(
    job: Job<{
      meetingId: string;
      userId: string;
      transcript: string;
      logs: { speaker: string; duration: number }[];
    }>,
  ) {
    const { meetingId, userId, transcript, logs = [] } = job.data;

    if (!meetingId || !userId || !transcript?.trim()) {
      throw new Error(
        "handleStructuredSummarization: meetingId, userId, and transcript are required",
      );
    }

    const structuredData = await this.aiService.summarizeStructured(transcript);
    const participation = this.aiService.computeParticipation(logs);

    const savedSummary = await this.summaryModel.create({
      meetingId,
      userId,
      topics: structuredData.topics,
      decisions: structuredData.decisions,
      actionItems: structuredData.actionItems,
      participation,
    });

    this.eventEmitter.emit("summary.completed", {
      userId,
      meetingId,
      summaryId: savedSummary._id,
      participation,
      ...structuredData,
    });

    return savedSummary;
  }

  private async handleSummarize(data: any): Promise<any> {
    const {
      roomId,
      userId,
      isVideoCall = false,
      callStartTime,
      callEndTime,
      overrideLanguage,
    } = data;

    // Restored input validation — previously an undefined roomId would go
    // straight into a Mongo query with undefined behavior instead of failing
    // the job with a clear, visible error.
    if (!roomId) {
      throw new Error("handleSummarize: roomId is required");
    }

    const db = await this.getDb();
    const messagesCollection = isVideoCall
      ? db.collection("videocall_speech_transcripts")
      : db.collection("messages");

    let extraQuery: any = {};
    if (isVideoCall && callStartTime && callEndTime) {
      extraQuery.timestamp = { $gte: callStartTime, $lte: callEndTime };
    }

    // Restored string-then-ObjectId fallback query, since roomId isn't
    // stored consistently as one type across all documents.
    const messages = await this.aiService.findMessagesByRoom(
      messagesCollection,
      roomId,
      isVideoCall ? { timestamp: 1 } : { createdAt: 1 },
      extraQuery,
    );

    if (!messages.length) {
      return { fullSummary: null, userSummary: null };
    }

    const senderIds = [
      ...new Set(
        messages.map((m: any) => (isVideoCall ? m.userId : m.senderId)),
      ),
    ];
    const validObjectIds = senderIds
      .filter((id) => typeof id === "string" && ObjectId.isValid(id))
      .map((id) => new ObjectId(id as string));

    const users =
      validObjectIds.length > 0
        ? await db
            .collection("users")
            .find({ _id: { $in: validObjectIds } })
            .project({ _id: 1, name: 1 })
            .toArray()
        : [];

    const userMap = new Map(
      users.map((u: any) => [u._id.toString(), u.name || "Guest"]),
    );

    const formattedMessages = messages
      .map((m: any) => {
        const senderId = String(isVideoCall ? m.userId : m.senderId);
        const senderName = isVideoCall
          ? m.userName || userMap.get(senderId) || "Guest"
          : userMap.get(senderId) || "Guest";
        return {
          sender: senderName,
          senderId,
          content: String(isVideoCall ? m.text : m.content),
        };
      })
      .filter(
        (m) =>
          m.content && m.content.trim().length > 0 && m.content !== "undefined",
      );

    if (formattedMessages.length === 0)
      return { fullSummary: null, userSummary: null };

    const fullChatText = formattedMessages
      .map((m) => `${m.sender}: ${m.content}`)
      .join("\n");

    // Restored: full 19-language override map, plus majority-vote detection
    // from video-call transcript metadata when no override is given.
    let detectedLanguage: string;
    if (overrideLanguage) {
      detectedLanguage =
        this.aiService.resolveOverrideLanguage(overrideLanguage);
    } else if (isVideoCall) {
      detectedLanguage = this.aiService.detectVideoCallLanguage(
        messages,
        fullChatText,
      );
    } else {
      detectedLanguage = this.aiService.detectLanguage(fullChatText);
    }

    let userText: string | null = null;
    let userName = "User";
    if (userId) {
      const userMessages = formattedMessages.filter(
        (m) => m.senderId === String(userId),
      );
      if (userMessages.length > 0) {
        userName = userMessages[0].sender;
        userText = userMessages
          .map((m) => `${m.sender}: ${m.content}`)
          .join("\n");
      }
    }

    const fullPrompt = isVideoCall
      ? `You are summarizing a video call conversation. The conversation is in ${detectedLanguage}.\n\nConversation:\n${fullChatText}\n\nPlease provide a comprehensive summary in ${detectedLanguage} including:\n1. Main Topics Discussed\n2. Key Decisions Made\n3. Action Items\n4. Overall Summary`
      : `You are summarizing a chat conversation. The conversation is in ${detectedLanguage}.\n\nConversation:\n${fullChatText}\n\nProvide a concise summary in ${detectedLanguage} including:\n- Main topics discussed\n- Key points and decisions\n- Important questions or concerns`;

    const userPrompt = isVideoCall
      ? `You are summarizing one person's contributions in a video call. The conversation is in ${detectedLanguage}.\n\n${userName}'s statements:\n${userText}\n\nProvide a summary in ${detectedLanguage} focusing on:\n1. Their main talking points\n2. Questions they asked\n3. Decisions or suggestions they made\n4. Their level of participation`
      : `You are summarizing messages from ${userName}. The messages are in ${detectedLanguage}.\n\n${userName}'s messages:\n${userText}\n\nProvide a concise summary in ${detectedLanguage} including:\n- Their main contributions\n- Questions they raised\n- Key points they made`;

    const [fullSummary, userSummary] = await Promise.all([
      userId
        ? Promise.resolve(null)
        : this.aiService.summarizeText(
            fullChatText,
            fullPrompt,
            detectedLanguage,
          ),
      userText
        ? this.aiService.summarizeText(userText, userPrompt, detectedLanguage)
        : Promise.resolve(null),
    ]);

    await this.speechTranscriptsService.saveSummary({
      roomId,
      fullSummary,
      userSummary,
      detectedLanguage,
    });

    await this.notificationQueue.add("send-realtime-alert", {
      roomId,
      userId,
      type: "SUMMARY_COMPLETED",
      payload: { fullSummary, userSummary, detectedLanguage },
    });

    return { fullSummary, userSummary, detectedLanguage };
  }

  private async handleSuggestion(data: any): Promise<any> {
    const {
      roomId,
      userId,
      userName,
      lastMessagesCount = 10,
      contextText,
    } = data;

    // Restored input validation. Previously this silently fell through to
    // generic canned suggestions with no signal that the job payload was malformed.
    if (!roomId && !contextText) {
      throw new Error(
        "handleSuggestion: either roomId or contextText is required",
      );
    }

    if (roomId) {
      if (!userId) {
        throw new Error(
          "handleSuggestion: userId is required when roomId is provided",
        );
      }

      // Restored 30s cache, keyed the same way as the old route.
      const cacheKey = `${userId}-${roomId}`;
      const cached = this.aiService.getCachedSuggestions(cacheKey);
      if (cached) {
        return { suggestions: cached, cached: true };
      }

      const db = await this.getDb();

      try {
        const suggestions = await this.aiService.generateSuggestionsFromDB(
          db,
          roomId,
          userId,
          userName,
          lastMessagesCount,
        );
        this.aiService.setCachedSuggestions(cacheKey, suggestions);

        // Suggestions now get the same real-time delivery path as summaries.
        // Previously nothing was pushed to notification-queue for this job type,
        // so unless something else was polling job results directly, generated
        // suggestions had no way to reach the client.
        await this.notificationQueue.add("send-realtime-alert", {
          roomId,
          userId,
          type: "suggestions-ready",
          payload: { suggestions },
        });

        return { suggestions };
      } catch (error: any) {
        // Restored fallback path — this was the single biggest regression.
        // Previously any Gemini error (quota, malformed JSON, timeout) failed
        // the whole job with nothing returned to the user.
        const db2 = await this.getDb();
        const recentMessages = await this.aiService.findMessagesByRoom(
          db2.collection("messages"),
          roomId,
          { createdAt: -1 },
        );
        const fallbackSuggestions = this.aiService.generateFallbackSuggestions(
          recentMessages,
          userId,
        );
        this.aiService.setCachedSuggestions(cacheKey, fallbackSuggestions);

        await this.notificationQueue.add("send-realtime-alert", {
          roomId,
          userId,
          type: "suggestions-ready",
          payload: {
            suggestions: fallbackSuggestions,
            note: "AI unavailable - using contextual suggestions",
          },
        });

        return {
          suggestions: fallbackSuggestions,
          note:
            error.message === "QUOTA_EXCEEDED"
              ? "API quota exceeded. Using contextual suggestions."
              : "AI unavailable - using contextual suggestions",
        };
      }
    }

    if (contextText) {
      try {
        const suggestions = await this.aiService.getAISuggestions(
          contextText,
          userName || "User",
          0,
        );
        return { suggestions };
      } catch (error: any) {
        return {
          suggestions: [
            "Could you tell me more about that?",
            "That sounds interesting. What do you think?",
          ],
          note:
            error.message === "QUOTA_EXCEEDED"
              ? "API quota exceeded. Using contextual suggestions."
              : "AI unavailable - using contextual suggestions",
        };
      }
    }

    return {
      suggestions: [
        "Could you tell me more about that?",
        "That sounds interesting. What do you think?",
      ],
    };
  }
}
