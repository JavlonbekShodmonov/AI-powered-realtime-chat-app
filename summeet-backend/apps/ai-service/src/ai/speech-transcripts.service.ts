import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { MongoClient, Db, ObjectId } from "mongodb";

@Injectable()
export class SpeechTranscriptsService implements OnModuleDestroy {
  private client: MongoClient;
  private db: Db;

  private async getDb(): Promise<Db> {
    if (!this.db) {
      const uri =
        process.env.MONGODB_URI || "mongodb://localhost:27017/summeet";
      this.client = new MongoClient(uri);
      await this.client.connect();
      this.db = this.client.db();
    }
    return this.db;
  }

  async onModuleDestroy() {
    if (this.client) {
      await this.client.close();
    }
  }

 async getLatestSummary(roomId: string) {
    const db = await this.getDb();
    const collection = db.collection("videocall_summaries");

    let doc = await collection.findOne({ roomId });
    if (!doc && ObjectId.isValid(roomId)) {
      doc = await collection.findOne({ roomId: new ObjectId(roomId) });
    }
    if (!doc) return null;

    return {
      fullSummary: doc.fullSummary ?? null,
      userSummary: doc.userSummary ?? null,
      detectedLanguage: doc.detectedLanguage ?? null,
    };
  }

  async saveChunk(data: {
    roomId: string;
    userId: string;
    userName: string;
    text: string;
    timestamp: number;
  }) {
    const db = await this.getDb();
    await db.collection("videocall_speech_transcripts").insertOne(data);
  }

  async transcribeWithGroq(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
  ): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GROQ_API_KEY is not configured in the AI microservice environment.",
      );
    }

    const formData = new FormData();
    const uint8Array = Uint8Array.from(fileBuffer);
    const blob = new Blob([uint8Array], { type: mimeType });
    formData.append("file", blob, filename);
    formData.append("model", "whisper-large-v3-turbo");

    const response = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: formData,
      },
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Groq API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    return data.text || "";
  }
  async saveSummary(data: {
    roomId: string;
    fullSummary?: string | null;
    userSummary?: string | null;
    detectedLanguage?: string;
  }) {
    const db = await this.getDb();
    const { roomId, fullSummary, userSummary, detectedLanguage } = data;

    // $set only fields actually provided — handleSummarize computes either
    // fullSummary OR userSummary per call (never both), so this avoids
    // overwriting one with null when only the other was just generated.
    const update: Record<string, any> = { roomId, updatedAt: new Date() };
    if (fullSummary !== undefined) update.fullSummary = fullSummary;
    if (userSummary !== undefined) update.userSummary = userSummary;
    if (detectedLanguage !== undefined)
      update.detectedLanguage = detectedLanguage;

    // upsert keyed by roomId — one doc per room, always "latest" by construction
    await db
      .collection("videocall_summaries")
      .updateOne({ roomId }, { $set: update }, { upsert: true });
  }
}
