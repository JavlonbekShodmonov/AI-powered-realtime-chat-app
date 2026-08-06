import { Injectable, Logger } from "@nestjs/common";
import { GoogleGenAI } from "@google/genai";
import { Db, ObjectId } from "mongodb";
import { franc } from "franc-all";
interface CachedSuggestions {
  timestamp: number;
  suggestions: string[];
}

@Injectable()
export class AIService {
  private readonly ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });
  private readonly logger = new Logger(AIService.name);
  private readonly CHUNK_SIZE = 1000;
  private readonly DB_TIMEOUT_MS = 5000;
  private readonly SUGGESTION_CACHE_TTL_MS = 30000;

  // Restored from the old route.ts — mapping speech/locale codes to full language names.
  // This was collapsed to only 'uz-UZ' vs everything-else in the migration, which silently
  // broke every non-Uzbek/English override (Russian, Kazakh, Turkish, etc).
  private readonly langMap: Record<string, string> = {
    "uz-UZ": "Uzbek",
    "ru-RU": "Russian",
    "en-US": "English",
    "en-GB": "English",
    "kk-KZ": "Kazakh",
    "ky-KG": "Kyrgyz",
    "tg-TJ": "Tajik",
    "tk-TM": "Turkmen",
    "az-AZ": "Azerbaijani",
    "tr-TR": "Turkish",
    "es-ES": "Spanish",
    "fr-FR": "French",
    "de-DE": "German",
    "it-IT": "Italian",
    "pt-BR": "Portuguese",
    "ja-JP": "Japanese",
    "ko-KR": "Korean",
    "zh-CN": "Chinese",
    "ar-SA": "Arabic",
    "hi-IN": "Hindi",
  };

  // Simple in-memory suggestion cache, restored from suggest-response/route.ts.
  // NOTE: this is per-worker-process memory. If you ever run more than one
  // ai-service worker instance, this cache won't be shared across them — fine
  // for now, but if you scale workers horizontally, move this to Redis instead.
  private readonly suggestionCache = new Map<string, CachedSuggestions>();

  resolveOverrideLanguage(code: string): string {
    return this.langMap[code] || "English";
  }

  getCachedSuggestions(cacheKey: string): string[] | null {
    const cached = this.suggestionCache.get(cacheKey);
    if (
      cached &&
      Date.now() - cached.timestamp < this.SUGGESTION_CACHE_TTL_MS
    ) {
      return cached.suggestions;
    }
    return null;
  }

  setCachedSuggestions(cacheKey: string, suggestions: string[]): void {
    this.suggestionCache.set(cacheKey, { timestamp: Date.now(), suggestions });
    if (this.suggestionCache.size > 100) {
      const oldestKey = this.suggestionCache.keys().next().value;
      if (oldestKey) this.suggestionCache.delete(oldestKey);
    }
  }

  // ISO 639-3 -> friendly name, for languages likely to actually show up.
  // Anything not in here just falls back to the raw code (e.g. "srp"),
  // which Gemini still understands fine when building the prompt — this
  // map is a cosmetic nicety, not a correctness requirement.
  private readonly iso6393ToName: Record<string, string> = {
    eng: "English",
    uzn: "Uzbek",
    rus: "Russian",
    kaz: "Kazakh",
    kir: "Kyrgyz",
    tgk: "Tajik",
    tuk: "Turkmen",
    aze: "Azerbaijani",
    tur: "Turkish",
    spa: "Spanish",
    por: "Portuguese",
    fra: "French",
    deu: "German",
    ita: "Italian",
    nld: "Dutch",
    pol: "Polish",
    ukr: "Ukrainian",
    bel: "Belarusian",
    cmn: "Chinese",
    jpn: "Japanese",
    kor: "Korean",
    arb: "Arabic",
    heb: "Hebrew",
    hin: "Hindi",
    tha: "Thai",
    vie: "Vietnamese",
    ind: "Indonesian",
    swe: "Swedish",
  };

  // Real statistical language detection (trigram model, 400+ languages)
  // instead of hand-maintained keyword lists. The old approach could only
  // ever "detect" the handful of languages someone bothered to write a
  // word list for, and even then broke on ties/underpopulated lists.
  detectLanguage(text: string): string {
    if (!text || text.length < 10) return "Auto";

    const code = franc(text); // ISO 639-3, or "und" if undetermined
    console.log(`[detectLanguage] franc code="${code}" text="${text.slice(0, 40)}"`); // TEMP
    if (code === "und") return "Auto";

    return this.iso6393ToName[code] || code;
  }

  // Majority-vote language detection across video-call transcript metadata,
  // restored from route.ts. Falls back to text-based detection if no
  // per-message `language` field is present.
  detectVideoCallLanguage(messages: any[], fullChatText: string): string {
    const languages = messages
      .map((m: any) => m.language)
      .filter((l: string) => l);
    if (languages.length === 0) {
      return this.detectLanguage(fullChatText);
    }
    const langCount: Record<string, number> = {};
    languages.forEach((l: string) => {
      langCount[l] = (langCount[l] || 0) + 1;
    });
    const mostCommon = Object.entries(langCount).sort(
      (a, b) => b[1] - a[1],
    )[0][0];
    return this.langMap[mostCommon] || "English";
  }

  chunkText(text: string, size: number): string[] {
    const chunks = [];
    let start = 0;
    while (start < text.length) {
      chunks.push(text.slice(start, start + size));
      start += size;
    }
    return chunks;
  }

  // 2. Update summarizeText to handle the 'Auto' fallback
  async summarizeText(
    text: string,
    prompt: string,
    language = "Auto",
  ): Promise<string> {
    const chunks = this.chunkText(text, this.CHUNK_SIZE);
    const summaries: string[] = [];

    // If we don't know the language, explicitly tell Gemini to figure it out
    const languageInstruction =
      language === "Auto"
        ? `\n[SYSTEM RULE: MANDATORY LANGUAGE]\nIdentify the primary language used in the conversation. You MUST write the entire summary in that EXACT same language. Do not default to English unless the conversation is actually in English.\n`
        : `\n[SYSTEM RULE: MANDATORY LANGUAGE]\nThe user's conversation is in ${language}.\nYou MUST write the entire summary in ${language}.\n`;

    for (const chunk of chunks) {
      try {
        const result = await this.ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [{ text: `${prompt}${languageInstruction}\n\n${chunk}` }],
            },
          ],
        });
        const summary = result.candidates?.[0]?.content?.parts?.[0]?.text;
        if (summary) summaries.push(summary);
      } catch (error: any) {
        this.logger.error(`Chunk summarization error: ${error.message}`);
        if (
          error.message?.includes("quota") ||
          error.message?.includes("RESOURCE_EXHAUSTED")
        ) {
          return `Summary unavailable due to API quota limits. Raw sample:\n\n${text.substring(0, 500)}...`;
        }
        throw error;
      }
    }

    if (summaries.length > 1) {
      try {
        const finalResult = await this.ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `${prompt}${languageInstruction}\n\n${summaries.join("\n")}`,
                },
              ],
            },
          ],
        });
        return (
          finalResult.candidates?.[0]?.content?.parts?.[0]?.text ||
          summaries.join("\n\n")
        );
      } catch (error: any) {
        this.logger.error(`Final summarization error: ${error.message}`);
        return summaries.join("\n\n");
      }
    }
    return summaries[0] || "";
  }

  // 3. Update getAISuggestions to enforce the language constraint
  async getAISuggestions(
    conversation: string,
    userName: string,
    userMessageCount: number,
    retryCount = 0,
  ): Promise<string[]> {
    const prompt = `You are an AI assistant helping someone respond in a professional meeting chat.
    
Context:
${conversation}
User: ${userName}
Messages sent: ${userMessageCount}

Suggest 3-5 responses. Respond IN THE EXACT SAME LANGUAGE as the conversation context. Format as a JSON array of strings: ["s1", "s2"]. Only return the array.`;

    try {
      const result = await this.ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: prompt }] }],
      });
      let responseText =
        result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
      responseText = responseText
        .replace(/```json\n?/g, "")
        .replace(/```\n?/g, "")
        .trim();

      const suggestions = JSON.parse(responseText);
      if (!Array.isArray(suggestions) || suggestions.length === 0) {
        throw new Error("Invalid response format");
      }
      return suggestions.slice(0, 5);
    } catch (error: any) {
      this.logger.error(
        `AI suggestion error (attempt ${retryCount + 1}): ${error.message}`,
      );

      if (
        error.message?.includes("quota") ||
        error.message?.includes("RESOURCE_EXHAUSTED")
      ) {
        throw new Error("QUOTA_EXCEEDED");
      }

      if (retryCount < 2) {
        await new Promise((res) => setTimeout(res, 1000 * (retryCount + 1)));
        return this.getAISuggestions(
          conversation,
          userName,
          userMessageCount,
          retryCount + 1,
        );
      }
      throw error;
    }
  }

  // Restored — this existed before but nothing called it after the migration,
  // so any Gemini failure during suggestion generation used to just fail the
  // whole BullMQ job instead of degrading gracefully.
  generateFallbackSuggestions(recentMessages: any[], userId: string): string[] {
    const userCount = recentMessages.filter(
      (m) => String(m.senderId) === String(userId),
    ).length;
    if (userCount === 0) {
      return [
        "Hi everyone! Thanks for having me here.",
        "Hello! I'm looking forward to our discussion.",
        "Hi! What should we start with?",
      ];
    }
    const last = recentMessages[recentMessages.length - 1];
    const wasQuestion =
      typeof last?.content === "string" && last.content.includes("?");
    const wasFromOther = String(last?.senderId) !== String(userId);

    if (wasQuestion && wasFromOther) {
      return [
        "That's a great question. Let me think about it.",
        "Good point! Here's what I think...",
        "I'd be happy to clarify that.",
      ];
    }
    return [
      "I agree with that approach.",
      "Could you elaborate on that point?",
      "That makes sense. What's the next step?",
    ];
  }

  // Queries by roomId as a raw value first, then retries with ObjectId if
  // nothing came back — restored from route.ts. Your data has roomId stored
  // inconsistently (string vs ObjectId) across documents, and going straight
  // to "convert if valid ObjectId" (as the migrated code did) skips the string
  // match entirely, silently returning zero messages for some rooms.
  private async queryMessagesByRoom(
    collection: any,
    roomId: string,
    sort: Record<string, 1 | -1>,
    limit?: number,
    extraQuery: Record<string, any> = {},
  ): Promise<any[]> {
    let query: any = { roomId, ...extraQuery };
    let cursor = collection.find(query).sort(sort);
    if (limit) cursor = cursor.limit(limit);
    let messages = await cursor.toArray();

    if (messages.length === 0 && ObjectId.isValid(roomId)) {
      query = { roomId: new ObjectId(roomId), ...extraQuery };
      cursor = collection.find(query).sort(sort);
      if (limit) cursor = cursor.limit(limit);
      messages = await cursor.toArray();
    }
    return messages;
  }

  // Accepts an already-connected `db` handle rather than opening its own
  // MongoClient per call. The old version instantiated + connected a brand
  // new MongoClient on every single suggestion request, which is real
  // per-request connection overhead you don't need — the processor already
  // holds one long-lived connection, so we reuse it.
  async generateSuggestionsFromDB(
    db: Db,
    roomId: string,
    userId: string,
    userName: string,
    lastMessagesCount: number = 10,
  ): Promise<string[]> {
    const fetchPromise = this.queryMessagesByRoom(
      db.collection("messages"),
      roomId,
      { createdAt: -1 },
      lastMessagesCount,
    );
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error("Database timeout")),
        this.DB_TIMEOUT_MS,
      ),
    );

    let messages = (await Promise.race([
      fetchPromise,
      timeoutPromise,
    ])) as any[];

    if (messages.length === 0) {
      return [
        "Hi! Nice to meet you.",
        "Hello, how can I help you today?",
        "Hey! Looking forward to our discussion.",
      ];
    }

    messages = messages.reverse();

    const senderIds = [...new Set(messages.map((m: any) => m.senderId))];
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

    const userMap = new Map<string, string>();
    users.forEach((u: any) => userMap.set(u._id.toString(), u.name || "Guest"));

    const conversation = messages
      .map((m: any) => {
        const senderId =
          m.senderId instanceof ObjectId
            ? m.senderId.toString()
            : String(m.senderId);
        const senderName = userMap.get(senderId) || "Guest";
        const isCurrentUser = senderId === String(userId);
        return `${isCurrentUser ? "You" : senderName}: ${m.content}`;
      })
      .join("\n");

    const userMessageCount = messages.filter(
      (m: any) => String(m.senderId) === String(userId),
    ).length;

    return this.getAISuggestions(conversation, userName, userMessageCount);
  }

  // Exposed so the processor can run the same string-then-ObjectId-fallback
  // query for summarization without duplicating the logic.
  async findMessagesByRoom(
    collection: any,
    roomId: string,
    sort: Record<string, 1 | -1>,
    extraQuery: Record<string, any> = {},
  ): Promise<any[]> {
    return this.queryMessagesByRoom(
      collection,
      roomId,
      sort,
      undefined,
      extraQuery,
    );
  }

  async summarizeStructured(transcript: string): Promise<{
    topics: string[];
    decisions: string[];
    actionItems: { owner: string; task: string }[];
  }> {
    const prompt = `Analyze the following meeting transcript. Provide a summary strictly structured as JSON.
      Do not include any formatting, markdown markers (like \`\`\`json), or conversational filler. Return ONLY valid JSON.

      JSON Schema:
      {
        "topics": ["string"],
        "decisions": ["string"],
        "actionItems": [
          { "owner": "string", "task": "string" }
        ]
      }

      Transcript:
      ${transcript}
    `;

    const response = await this.ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text =
      response.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "";
    try {
      return JSON.parse(text.replace(/```json|```/g, ""));
    } catch (e) {
      return {
        topics: ["Meeting Recap"],
        decisions: ["Could not parse decisions automatically."],
        actionItems: [],
      };
    }
  }

  computeParticipation(
    transcriptsWithTimestamps: { speaker: string; duration: number }[],
  ): Record<string, number> {
    const totals: Record<string, number> = {};
    let grandTotal = 0;

    for (const log of transcriptsWithTimestamps) {
      totals[log.speaker] = (totals[log.speaker] || 0) + log.duration;
      grandTotal += log.duration;
    }

    if (grandTotal === 0) return {};

    const percentages: Record<string, number> = {};
    for (const speaker of Object.keys(totals)) {
      percentages[speaker] = Math.round((totals[speaker] / grandTotal) * 100);
    }

    return percentages;
  }
}
