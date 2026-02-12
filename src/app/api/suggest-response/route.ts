// app/api/suggest-response/route.ts
// COMPLETE CRASH-PROOF VERSION - Never hits quota limits, zero errors for users

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// ✅ CONFIGURATION
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const DAILY_QUOTA = 1500; // Gemini free tier total
const SAFETY_BUFFER = 0.9; // Use only 90% to be safe
const MAX_DAILY_REQUESTS = Math.floor(DAILY_QUOTA * SAFETY_BUFFER * 0.5); // 675 for this endpoint (half of total)

// ✅ QUOTA TRACKING
let dailyRequestCount = 0;
let dailyResetTime = Date.now() + (24 * 60 * 60 * 1000);
let quotaExhausted = false;
let quotaResetTime = 0;

// ✅ CACHING
const requestCache = new Map<string, { timestamp: number; suggestions: string[] }>();

// ✅ AUTO-RESET DAILY QUOTA
setInterval(() => {
  const now = Date.now();
  if (now >= dailyResetTime) {
    console.log("✅ Daily quota reset - Counter: 0");
    dailyRequestCount = 0;
    dailyResetTime = now + (24 * 60 * 60 * 1000);
    quotaExhausted = false;
  }
}, 60 * 1000);

// ✅ QUOTA CHECKER
function checkDailyQuota(): { allowed: boolean; remaining: number; percentage: number } {
  const remaining = MAX_DAILY_REQUESTS - dailyRequestCount;
  const percentage = Math.round((dailyRequestCount / MAX_DAILY_REQUESTS) * 100);
  
  if (percentage >= 80 && percentage < 90) {
    console.warn(`⚠️ Quota Warning: ${percentage}% used (${dailyRequestCount}/${MAX_DAILY_REQUESTS})`);
  }
  
  if (percentage >= 90 && percentage < 100) {
    console.error(`🚨 Quota Critical: ${percentage}% used (${dailyRequestCount}/${MAX_DAILY_REQUESTS})`);
  }
  
  if (dailyRequestCount >= MAX_DAILY_REQUESTS) {
    console.error(`❌ Daily quota exhausted: ${dailyRequestCount}/${MAX_DAILY_REQUESTS}`);
    quotaExhausted = true;
    quotaResetTime = dailyResetTime;
    return { allowed: false, remaining: 0, percentage: 100 };
  }
  
  return { allowed: true, remaining, percentage };
}

function incrementQuota() {
  dailyRequestCount++;
  const percentage = Math.round((dailyRequestCount / MAX_DAILY_REQUESTS) * 100);
  console.log(`📊 API Call #${dailyRequestCount}/${MAX_DAILY_REQUESTS} (${percentage}% quota used)`);
}

// ✅ SMART CONTEXT-AWARE FALLBACK GENERATOR
function generateSmartFallbacks(
  recentMessages: any[],
  userId: string,
  userMap: Map<string, string>
): string[] {
  if (recentMessages.length === 0) {
    return [
      "Hi! Nice to meet you.",
      "Hello! Looking forward to our chat.",
      "Hey there! How can I help?",
      "Hi! Thanks for connecting.",
    ];
  }

  const userMessageCount = recentMessages.filter((m: any) => {
    const senderId = m.senderId instanceof ObjectId ? m.senderId.toString() : String(m.senderId);
    return senderId === userId || m.senderId === userId;
  }).length;
  
  if (userMessageCount === 0) {
    return [
      "Thanks for inviting me to this discussion!",
      "Hello everyone! Happy to be here.",
      "Hi! What are we discussing today?",
      "Hey! Looking forward to contributing.",
    ];
  }

  const lastMessage = recentMessages[recentMessages.length - 1];
  const lastContent = lastMessage.content.toLowerCase();
  const wasFromOther = (() => {
    const lastSenderId = lastMessage.senderId instanceof ObjectId 
      ? lastMessage.senderId.toString() 
      : String(lastMessage.senderId);
    return lastSenderId !== userId && lastMessage.senderId !== userId;
  })();

  // SMART PATTERN MATCHING
  if (lastContent.includes("?") && wasFromOther) {
    return [
      "Great question! Let me think about that.",
      "That's an interesting point. Here's my view:",
      "I'd be happy to share my thoughts on this.",
      "Good question! Based on my understanding:",
      "Let me address that step by step.",
    ];
  }

  if (lastContent.includes("thank") && wasFromOther) {
    return [
      "You're welcome! Happy to help.",
      "No problem at all!",
      "Glad I could help!",
      "Anytime! Let me know if you need anything else.",
    ];
  }

  if (lastContent.includes("agree") || lastContent.includes("think so")) {
    return [
      "I see your point there.",
      "That's a valid perspective.",
      "Interesting - I hadn't thought of it that way.",
      "That makes sense to me too.",
    ];
  }

  if (lastContent.includes("disagree") || lastContent.includes("but ")) {
    return [
      "I understand your concern. Here's another angle:",
      "That's fair. Let me clarify my position:",
      "I see where you're coming from. However:",
      "Valid point. Here's how I see it:",
    ];
  }

  if (lastContent.includes("hello") || lastContent.includes("hi ") || lastContent.includes("hey")) {
    return [
      "Hello! How's it going?",
      "Hi there! Nice to connect.",
      "Hey! Good to see you.",
      "Hi! What can I help you with?",
    ];
  }

  // Default professional responses
  return [
    "That's a good point. What do you all think?",
    "I agree. How should we proceed?",
    "Interesting. Could you elaborate on that?",
    "That makes sense. What's the next step?",
    "I see what you mean. Let's discuss further.",
  ];
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// ✅ ULTRA-SHORT AI SUGGESTION FUNCTION
async function getAISuggestions(
  conversation: string,
  userName: string,
  userMessageCount: number
): Promise<string[]> {
  // Check quota
  const quotaCheck = checkDailyQuota();
  
  if (!quotaCheck.allowed || quotaExhausted) {
    throw new Error("QUOTA_EXHAUSTED");
  }

  // MINIMAL PROMPT
  const prompt = `Chat:
${conversation}

${userName} (${userMessageCount} msgs)

4 brief replies (1 sentence):
["...", "...", "...", "..."]`;

  try {
    incrementQuota();
    
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });

    let responseText = result.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    responseText = responseText.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();

    const suggestions = JSON.parse(responseText);

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      throw new Error("Invalid format");
    }

    // Reset quota flag on success
    if (quotaExhausted) {
      console.log("✅ Quota restored");
      quotaExhausted = false;
    }

    return suggestions.slice(0, 5);
  } catch (error: any) {
    console.error("❌ AI error:", error.message);

    if (error.message?.includes("quota") || 
        error.message?.includes("RESOURCE_EXHAUSTED") || 
        error.status === 429) {
      quotaExhausted = true;
      quotaResetTime = dailyResetTime;
      throw new Error("QUOTA_EXHAUSTED");
    }

    throw error;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { roomId, userId, userName, lastMessagesCount = 15 } = await req.json();

    if (!roomId || !userId) {
      return NextResponse.json(
        { error: "roomId and userId are required" },
        { status: 400 }
      );
    }

    // ✅ CACHE CHECK FIRST
    const cacheKey = `${userId}-${roomId}`;
    const cached = requestCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      const secondsRemaining = Math.round((CACHE_DURATION - (Date.now() - cached.timestamp)) / 1000);
      console.log(`✅ Cache hit: ${cacheKey} (fresh for ${secondsRemaining}s)`);
      return NextResponse.json({
        suggestions: cached.suggestions,
        cached: true,
      });
    }

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

    if (recentMessages.length === 0) {
      const initialSuggestions = [
        "Hi! Nice to meet you.",
        "Hello! Looking forward to our chat.",
        "Hey! How's it going?",
        "Hi there! Ready to discuss.",
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

    // Use last 10 messages for context
    const limitedMessages = recentMessages.slice(-10);
    
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

      // ✅ CACHE FOR 5 MINUTES
      requestCache.set(cacheKey, {
        timestamp: Date.now(),
        suggestions,
      });

      // ✅ CACHE CLEANUP - Keep 200 entries max
      if (requestCache.size > 200) {
        const entries = Array.from(requestCache.entries());
        const toDelete = entries
          .sort((a, b) => a[1].timestamp - b[1].timestamp)
          .slice(0, 50);
        
        toDelete.forEach(([key]) => requestCache.delete(key));
        console.log(`🧹 Cleaned ${toDelete.length} old cache entries`);
      }

      return NextResponse.json({ 
        suggestions,
        quotaUsed: dailyRequestCount,
        quotaLimit: MAX_DAILY_REQUESTS,
      });
    } catch (error: any) {
      console.error("❌ AI error:", error);

      // ✅ ALWAYS PROVIDE SMART FALLBACKS
      const fallbackSuggestions = generateSmartFallbacks(
        recentMessages,
        userId,
        userMap
      );

      // Cache fallbacks (shorter duration - 1 minute)
      requestCache.set(cacheKey, {
        timestamp: Date.now() - (CACHE_DURATION - 60000),
        suggestions: fallbackSuggestions,
      });

      // ✅ NEVER SHOW ERRORS TO USERS - Silent fallback
      if (error.message === "QUOTA_EXHAUSTED") {
        console.log("⚠️ Using smart fallback (quota exhausted)");
      } else {
        console.log("⚠️ Using smart fallback (AI error)");
      }

      return NextResponse.json({
        suggestions: fallbackSuggestions,
      });
    }
  } catch (err: any) {
    console.error("❌ API error:", err);
    
    // ✅ EVEN ON TOTAL FAILURE, RETURN USEFUL SUGGESTIONS
    return NextResponse.json({
      suggestions: [
        "That's an interesting point.",
        "Could you tell me more about that?",
        "I see what you mean.",
        "Let's discuss this further.",
      ]
    });
  }
}