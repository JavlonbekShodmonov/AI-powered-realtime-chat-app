// app/api/suggest-response/route.ts
// OPTIMIZED VERSION WITH QUOTA MANAGEMENT

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// ✅ Enhanced caching with longer duration
const requestCache = new Map<string, { timestamp: number; suggestions: string[] }>();
const CACHE_DURATION = 0; // 2 minutes cache (increased from 30s)
const MAX_RETRIES = 1; // Reduced from 2 to save quota
const RETRY_DELAY = 2000; // Increased to 2 seconds

// ✅ More conservative rate limiting
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 3; // Reduced from 5
const requestQueue: Array<() => void> = [];

// ✅ Global quota tracking
let quotaExhausted = false;
let quotaResetTime = 0;

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

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ Enhanced fallback suggestions
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
      "Nice to meet you all!",
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
      "Thanks for asking - here's my perspective.",
    ];
  }

  // Check for agreement/disagreement patterns
  const lastContent = lastMessage.content.toLowerCase();
  if (lastContent.includes("agree") || lastContent.includes("think")) {
    return [
      "I share that perspective.",
      "That's an interesting viewpoint.",
      "I see what you mean. What's next?",
      "Could you elaborate on that?",
    ];
  }

  return [
    "I agree with that approach.",
    "Could you elaborate on that point?",
    "That makes sense. What's the next step?",
    "I see what you mean. How should we proceed?",
    "Thanks for sharing that insight.",
  ];
}

// ✅ Simplified AI prompt to use fewer tokens
async function getAISuggestions(
  conversation: string,
  userName: string,
  userMessageCount: number,
  retryCount = 0
): Promise<string[]> {
  // ✅ Check quota first
  if (quotaExhausted && Date.now() < quotaResetTime) {
    throw new Error("QUOTA_EXHAUSTED");
  }

  // ✅ Shorter, more efficient prompt
  const prompt = `Recent chat:
${conversation}

User: ${userName || "User"} (${userMessageCount} messages sent)

Suggest 4 brief, helpful responses (1-2 sentences each).
Return ONLY a JSON array: ["response 1", "response 2", "response 3", "response 4"]`;

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const suggestions = JSON.parse(responseText);

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new Error("Invalid response format");
    }

    // ✅ Reset quota flag on success
    if (quotaExhausted) {
      console.log("✅ Quota restored!");
      quotaExhausted = false;
    }

    return suggestions.slice(0, 5);
  } catch (error: any) {
    console.error(`❌ AI suggestion error (attempt ${retryCount + 1}):`, error.message);

    // ✅ Handle quota errors
    if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED") || error.status === 429) {
      console.error("🚨 QUOTA EXHAUSTED - Setting 1 hour cooldown");
      quotaExhausted = true;
      quotaResetTime = Date.now() + (60 * 60 * 1000); // 1 hour
      throw new Error("QUOTA_EXHAUSTED");
    }

    // ✅ Retry only once
    if (retryCount < MAX_RETRIES) {
      console.log(`⏳ Retrying in ${RETRY_DELAY}ms...`);
      await delay(RETRY_DELAY * (retryCount + 1));
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

    // ✅ Check cache first (before quota check)
    const cacheKey = `${userId}-${roomId}`;
    const cached = requestCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      console.log(`✅ Returning cached suggestions for ${cacheKey}`);
      return NextResponse.json({
        suggestions: cached.suggestions,
        cached: true,
      });
    }

    // ✅ Check if quota is exhausted
    if (quotaExhausted && Date.now() < quotaResetTime) {
      const client = await clientPromise;
      const db = client.db();
      const messagesCollection = db.collection("messages");
      const usersCollection = db.collection("users");

      let recentMessages = await messagesCollection
        .find({ roomId })
        .sort({ createdAt: -1 })
        .limit(lastMessagesCount)
        .toArray();

      if (recentMessages.length === 0 && ObjectId.isValid(roomId)) {
        recentMessages = await messagesCollection
          .find({ roomId: new ObjectId(roomId) })
          .sort({ createdAt: -1 })
          .limit(lastMessagesCount)
          .toArray();
      }

      recentMessages = recentMessages.reverse();

      const senderIds = [...new Set(recentMessages.map((m: any) => m.senderId))];
      const validObjectIds: ObjectId[] = [];
      
      senderIds.forEach((id: any) => {
        if (typeof id === 'string' && ObjectId.isValid(id)) {
          try {
            validObjectIds.push(new ObjectId(id));
          } catch (e) {}
        } else if (id instanceof ObjectId) {
          validObjectIds.push(id);
        }
      });

      const users = validObjectIds.length > 0 
        ? await usersCollection
            .find({ _id: { $in: validObjectIds } })
            .project({ _id: 1, name: 1 })
            .toArray()
        : [];

      const userMap = new Map<string, string>();
      users.forEach((u: any) => {
        userMap.set(u._id.toString(), u.name || "Guest");
      });

      const fallbackSuggestions = generateFallbackSuggestions(
        recentMessages,
        userId,
        userMap
      );

      const minutesLeft = Math.ceil((quotaResetTime - Date.now()) / 60000);
      
      return NextResponse.json({
        suggestions: fallbackSuggestions,
        warning: `AI quota exhausted. Resets in ${minutesLeft} min. Using contextual suggestions.`,
        quotaExhausted: true,
      });
    }

    // ✅ Wait for slot
    await waitForSlot();
    slotAcquired = true;

    const client = await clientPromise;
    const db = client.db();
    const messagesCollection = db.collection("messages");
    const usersCollection = db.collection("users");

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
      const initialSuggestions = [
        "Hi! Nice to meet you.",
        "Hello, how can I help you today?",
        "Hey! Looking forward to our discussion.",
        "Nice to connect with you!",
      ];
      
      requestCache.set(cacheKey, {
        timestamp: Date.now(),
        suggestions: initialSuggestions,
      });

      return NextResponse.json({ suggestions: initialSuggestions });
    }

    recentMessages = recentMessages.reverse();

    const senderIds = [...new Set(recentMessages.map((m: any) => m.senderId))];
    const validObjectIds: ObjectId[] = [];
    const stringIds: string[] = [];   
    
    senderIds.forEach((id: any) => {
      if (typeof id === 'string' && ObjectId.isValid(id)) {
        try {
          validObjectIds.push(new ObjectId(id));
          stringIds.push(id);
        } catch (e) {
          stringIds.push(id);
        }
      } else if (id instanceof ObjectId) {
        validObjectIds.push(id); 
        stringIds.push(id.toString());
      } else {
        stringIds.push(String(id));
      }
    });

    const users = validObjectIds.length > 0 
      ? await usersCollection
          .find({ _id: { $in: validObjectIds } })
          .project({ _id: 1, name: 1 })
          .toArray()
      : [];

    const userMap = new Map<string, string>();
    users.forEach((u: any) => {
      const idStr = u._id.toString();
      userMap.set(idStr, u.name || "Guest");
    });

    // ✅ Limit conversation length to save tokens
    const limitedMessages = recentMessages.slice(-8); // Only last 8 messages
    
    const conversation = limitedMessages
      .map((m: any) => {
        const senderId = m.senderId instanceof ObjectId ? m.senderId.toString() : String(m.senderId);
        const senderName = userMap.get(senderId) || "Guest";
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
      const suggestions = await getAISuggestions(
        conversation,
        userName,
        userMessageCount
      );

      // ✅ Cache with longer duration
      requestCache.set(cacheKey, {
        timestamp: Date.now(),
        suggestions,
      });

      // ✅ More aggressive cache cleanup
      if (requestCache.size > 50) { // Reduced from 100
        const entries = Array.from(requestCache.entries());
        const toDelete = entries
          .sort((a, b) => a[1].timestamp - b[1].timestamp)
          .slice(0, 10); // Delete oldest 10
        
        toDelete.forEach(([key]) => requestCache.delete(key));
      }

      return NextResponse.json({ suggestions });
    } catch (error: any) {
      console.error("❌ AI suggestion error:", error);

      const fallbackSuggestions = generateFallbackSuggestions(
        recentMessages,
        userId,
        userMap
      );

      // ✅ Cache fallback
      requestCache.set(cacheKey, {
        timestamp: Date.now() - (CACHE_DURATION - 30000), // Cache for 30s only
        suggestions: fallbackSuggestions,
      });

      if (error.message === "QUOTA_EXHAUSTED") {
        return NextResponse.json({
          suggestions: fallbackSuggestions,
          warning: "API quota exceeded. Using contextual suggestions.",
          quotaExhausted: true,
        });
      }

      return NextResponse.json({
        suggestions: fallbackSuggestions,
        note: "AI unavailable - using contextual suggestions",
      });
    }
  } catch (err: any) {
    console.error("❌ API error:", err);
    return NextResponse.json(
      { 
        error: `Internal server error: ${err.message}`,
        suggestions: [
          "Could you tell me more about that?",
          "That's interesting. What do you think?",
          "I'd like to understand this better.",
          "Thanks for sharing that.",
        ]
      },
      { status: 500 }
    );
  } finally {
    if (slotAcquired) {
      releaseSlot();
    }
  }
}