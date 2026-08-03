// app/api/suggest-response/route.ts
import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// ✅ Rate limiting with in-memory cache
const requestCache = new Map<string, { timestamp: number; suggestions: string[] }>();
const CACHE_DURATION = 30000; // 30 seconds cache per user+room
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

// ✅ Request queue to prevent overwhelming the API
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 5;
const requestQueue: Array<() => void> = [];

async function waitForSlot(): Promise<void> {
  if (activeRequests < MAX_CONCURRENT_REQUESTS) {
    activeRequests++;
    return;
  }

  return new Promise((resolve) => {
    requestQueue.push(() => {
      activeRequests++;
      resolve();
    });
  });
}

function releaseSlot() {
  activeRequests--;
  if (requestQueue.length > 0) {
    const next = requestQueue.shift();
    next?.();
  }
}

// ✅ Utility to add delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ Fallback suggestions generator
function generateFallbackSuggestions(
  recentMessages: any[],
  userId: string,
  userMap: Map<string, string>
): string[] {
  const userMessageCount = recentMessages.filter((m: any) => m.senderId === userId).length;
  
  if (userMessageCount === 0) {
    return [
      "Hi everyone! Thanks for having me here.",
      "Hello! I'm looking forward to our discussion.",
      "Hi! What should we start with?",
    ];
  }

  const lastMessage = recentMessages[recentMessages.length - 1];
  const wasQuestion = lastMessage.content.includes("?");
  const wasFromOther = lastMessage.senderId !== userId;

  if (wasQuestion && wasFromOther) {
    return [
      "That's a great question. Let me think about it.",
      "Good point! Here's what I think...",
      "I'd be happy to clarify that.",
      "Let me address that step by step.",
    ];
  }

  return [
    "I agree with that approach.",
    "Could you elaborate on that point?",
    "That makes sense. What's the next step?",
    "I see what you mean. How should we proceed?",
  ];
}

// ✅ Main AI suggestion function with retry logic
async function getAISuggestions(
  conversation: string,
  userName: string,
  userMessageCount: number,
  retryCount = 0
): Promise<string[]> {
  const prompt = `You are an AI assistant helping someone respond in a professional meeting chat. 

Conversation context:
${conversation}

User's name: ${userName || "User"}
User has sent ${userMessageCount} message(s) so far.

Based on this conversation, suggest 3-5 helpful, contextually appropriate responses that ${userName || "the user"} could send next. Consider:
- The flow and topic of the conversation
- What questions were asked that need answering
- Opportunities to contribute value or ask clarifying questions
- Professional tone appropriate for a business meeting
- Brief, clear responses (1-2 sentences each)

Format your response as a JSON array of strings, like this:
["suggestion 1", "suggestion 2", "suggestion 3"]

Only return the JSON array, nothing else.`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    
    // Clean up the response
    responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const suggestions = JSON.parse(responseText);

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new Error("Invalid response format");
    }

    return suggestions.slice(0, 5);
  } catch (error: any) {
    console.error(`❌ AI suggestion error (attempt ${retryCount + 1}):`, error.message);

    // ✅ Handle quota errors - don't retry
    if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
      throw new Error("QUOTA_EXCEEDED");
    }

    // ✅ Retry on other errors
    if (retryCount < MAX_RETRIES) {
      console.log(`⏳ Retrying in ${RETRY_DELAY}ms...`);
      await delay(RETRY_DELAY * (retryCount + 1)); // Exponential backoff
      return getAISuggestions(conversation, userName, userMessageCount, retryCount + 1);
    }

    throw error;
  }
}

export async function POST(req: NextRequest) {
  let slotAcquired = false;

  try {
    const { roomId, userId, userName, lastMessagesCount = 10 } = await req.json();

    if (!roomId || !userId) {
      return NextResponse.json(
        { error: "roomId and userId are required" },
        { status: 400 }
      );
    }

    // ✅ Check cache first
    const cacheKey = `${userId}-${roomId}`;
    const cached = requestCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`✅ Returning cached suggestions for ${cacheKey}`);
      return NextResponse.json({
        suggestions: cached.suggestions,
        cached: true,
      });
    }

    // ✅ Wait for available slot in queue
    await waitForSlot();
    slotAcquired = true;

    const client = await clientPromise;
    const db = client.db();
    const messagesCollection = db.collection("messages");
    const transcriptsCollection = db.collection("videocall_speech_transcripts");
    const usersCollection = db.collection("users");

    // ✅ Fetch recent messages with timeout
    const fetchMessagesPromise = messagesCollection
      .find({ roomId })
      .sort({ createdAt: -1 })
      .limit(lastMessagesCount)
      .toArray();

    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Database timeout")), 5000)
    );

    let recentMessages = await Promise.race([fetchMessagesPromise, timeoutPromise]) as any[];

    if (recentMessages.length === 0 && ObjectId.isValid(roomId)) {
      recentMessages = await messagesCollection
        .find({ roomId: new ObjectId(roomId) })
        .sort({ createdAt: -1 })
        .limit(lastMessagesCount)
        .toArray();
    }

    if (recentMessages.length === 0) {
      // Fallback to video call transcripts when regular chat messages are not found.
      const fetchTranscriptsPromise = transcriptsCollection
        .find({ roomId })
        .sort({ timestamp: -1 })
        .limit(lastMessagesCount)
        .toArray();

      recentMessages = await Promise.race([fetchTranscriptsPromise, timeoutPromise]) as any[];

      if (recentMessages.length === 0 && ObjectId.isValid(roomId)) {
        recentMessages = await transcriptsCollection
          .find({ roomId: new ObjectId(roomId) })
          .sort({ timestamp: -1 })
          .limit(lastMessagesCount)
          .toArray();
      }

      if (recentMessages.length > 0) {
        recentMessages = recentMessages.map((item: any) => ({
          senderId: item.userId || item.user_id || "guest",
          content: item.text || item.content || "",
          createdAt: item.timestamp || item.createdAt || Date.now(),
          userName: item.userName || item.user_name || "Guest",
          type: item.type || "speech",
        }));
      }
    }

    if (recentMessages.length === 0) {
      const initialSuggestions = [
        "Hi! Nice to meet you.",
        "Hello, how can I help you today?",
        "Hey! Looking forward to our discussion.",
      ];
      
      // Cache the result
      requestCache.set(cacheKey, {
        timestamp: Date.now(),
        suggestions: initialSuggestions,
      });

      return NextResponse.json({ suggestions: initialSuggestions });
    }

    // Reverse to get chronological order
    recentMessages = recentMessages.reverse();

    // ✅ FIX: Safe conversion of senderIds to ObjectId
    const senderIds = Array.from(new Set(recentMessages.map((m: any) => m.senderId)));
    
    // Convert to ObjectId only if valid, otherwise keep as string
    const validObjectIds: ObjectId[] = [];
    const stringIds: string[] = [];
    
    senderIds.forEach((id: any) => {
      if (typeof id === 'string' && ObjectId.isValid(id)) {
        try {
          validObjectIds.push(new ObjectId(id));
          stringIds.push(id);
        } catch (e) {
          // If conversion fails, treat as string
          stringIds.push(id);
        }
      } else if (id instanceof ObjectId) {
        validObjectIds.push(id);
        stringIds.push(id.toString());
      } else {
        // Keep as is if not string or ObjectId
        stringIds.push(String(id));
      }
    });

    // ✅ Query users with ObjectIds
    const users = validObjectIds.length > 0 
      ? await usersCollection
          .find({ _id: { $in: validObjectIds } })
          .project({ _id: 1, name: 1 })
          .toArray()
      : [];

    // ✅ Create userMap with both ObjectId and string representations
    const userMap = new Map<string, string>();
    users.forEach((u: any) => {
      const idStr = u._id.toString();
      userMap.set(idStr, u.name || "Guest");
    });

    // Format conversation
    const conversation = recentMessages
      .map((m: any) => {
        const senderId = m.senderId instanceof ObjectId ? m.senderId.toString() : String(m.senderId);
        const senderName = userMap.get(senderId) || m.userName || "Guest";
        const isCurrentUser = senderId === userId || m.senderId === userId;
        return `${isCurrentUser ? "You" : senderName}: ${m.content}`;
      })
      .join("\n");

    const userMessageCount = recentMessages.filter(
      (m: any) => {
        const senderId = m.senderId instanceof ObjectId ? m.senderId.toString() : String(m.senderId);
        return senderId === userId || m.senderId === userId;
      }
    ).length;

    try {
      // ✅ Get AI suggestions with retry logic
      const suggestions = await getAISuggestions(
        conversation,
        userName,
        userMessageCount
      );

      // ✅ Cache the successful result
      requestCache.set(cacheKey, {
        timestamp: Date.now(),
        suggestions,
      });

      // ✅ Clean up old cache entries (keep last 100)
      if (requestCache.size > 100) {
        const oldestKey = requestCache.keys().next().value;
        if (oldestKey) {
          requestCache.delete(oldestKey);
        }
      }

      return NextResponse.json({ suggestions });
    } catch (error: any) {
      console.error("❌ AI suggestion error:", error);

      // ✅ Generate contextual fallback suggestions
      const fallbackSuggestions = generateFallbackSuggestions(
        recentMessages,
        userId,
        userMap
      );

      // ✅ Cache fallback too (shorter duration)
      requestCache.set(cacheKey, {
        timestamp: Date.now() - (CACHE_DURATION - 10000), // Only cache for 10s
        suggestions: fallbackSuggestions,
      });

      if (error.message === "QUOTA_EXCEEDED") {
        return NextResponse.json(
          {
            suggestions: fallbackSuggestions,
            error: "API quota exceeded. Using contextual suggestions.",
          },
          { status: 200 }
        );
      }

      return NextResponse.json({
        suggestions: fallbackSuggestions,
        note: "AI unavailable - using contextual suggestions",
      });
    }
  } catch (err: any) {
    console.error("❌ API error:", err);
    console.error("❌ Error stack:", err.stack);
    return NextResponse.json(
      { 
        error: `Internal server error: ${err.message}`,
        suggestions: [
          "Could you tell me more about that?",
          "That's interesting. What do you think?",
          "I'd like to understand this better.",
        ]
      },
      { status: 500 }
    );
  } finally {
    // ✅ Always release the slot
    if (slotAcquired) {
      releaseSlot();
    }
  }
}