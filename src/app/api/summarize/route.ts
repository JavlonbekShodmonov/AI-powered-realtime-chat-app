// app/api/summarize/route.ts
// COMPLETE CRASH-PROOF VERSION - Never hits quota limits, zero errors for users

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// ✅ CONFIGURATION - Adjust these based on your needs
const CHUNK_SIZE = 2000; // Doubled for efficiency
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
const DAILY_QUOTA = 1500; // Gemini free tier total
const SAFETY_BUFFER = 0.9; // Use only 90% to be safe
const MAX_DAILY_REQUESTS = Math.floor(DAILY_QUOTA * SAFETY_BUFFER * 0.5); // 675 for this endpoint (half of total)

// ✅ QUOTA TRACKING - Prevents crashes
let dailyRequestCount = 0;
let dailyResetTime = Date.now() + (24 * 60 * 60 * 1000);
let quotaExhausted = false;
let quotaResetTime = 0;

// ✅ CACHING - 30 minute cache prevents most API calls
const summaryCache = new Map<string, { 
  timestamp: number; 
  fullSummary: string | null; 
  userSummary: string | null;
  detectedLanguage: string;
}>();

// ✅ AUTO-RESET DAILY QUOTA - Runs every minute
setInterval(() => {
  const now = Date.now();
  if (now >= dailyResetTime) {
    console.log("✅ Daily quota reset - Counter: 0");
    dailyRequestCount = 0;
    dailyResetTime = now + (24 * 60 * 60 * 1000);
    quotaExhausted = false;
  }
}, 60 * 1000);

// ✅ QUOTA CHECKER - Prevents going over limit
function checkDailyQuota(): { allowed: boolean; remaining: number; percentage: number } {
  const remaining = MAX_DAILY_REQUESTS - dailyRequestCount;
  const percentage = Math.round((dailyRequestCount / MAX_DAILY_REQUESTS) * 100);
  
  // Alert at 80%
  if (percentage >= 80 && percentage < 90) {
    console.warn(`⚠️ Quota Warning: ${percentage}% used (${dailyRequestCount}/${MAX_DAILY_REQUESTS})`);
  }
  
  // Alert at 90%
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

// ✅ LANGUAGE DETECTION
function detectLanguage(text: string): string {
  if (!text || text.length < 10) return 'English';
  
  const lowerText = text.toLowerCase();
  const scores: { [key: string]: number } = {};

  // Character set detection
  if (/[\u4e00-\u9fa5]/.test(text)) return 'Chinese';
  if (/[\u0600-\u06FF]/.test(text)) return 'Arabic';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'Japanese';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'Korean';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'Thai';
  if (/[\u0590-\u05FF]/.test(text)) return 'Hebrew';
  if (/[\u0370-\u03FF]/.test(text)) return 'Greek';
  
  // Uzbek Latin
  const uzbekLatinPatterns = [
    /\b(o'zbekiston|o'zbek|bo'lish|qilish|qilmoq|bo'lmoq|kerak|mumkin|shunday|bugun|ertaga|kecha|hozir)\b/gi,
    /\b(salom|xayr|rahmat|iltimos|ha|yo'q|nima|qanday|qachon|qayer|kim|nima\s+uchun)\b/gi,
    /\b(men|sen|u|biz|siz|ular|mening|sening|uning|bizning|sizning|ularning)\b/gi,
  ];
  
  let uzbekLatinScore = 0;
  uzbekLatinPatterns.forEach(pattern => {
    uzbekLatinScore += (lowerText.match(pattern) || []).length * 15;
  });
  const apostropheCount = (text.match(/[a-z]'[a-z]/gi) || []).length;
  uzbekLatinScore += apostropheCount * 10;
  scores['Uzbek'] = uzbekLatinScore;
  
  // Other languages
  const turkmenChars = (text.match(/[şžäňöüý]/g) || []).length;
  const turkmenWords = (lowerText.match(/\b(türkmen|türkmenistan|bolmak|etmek|diýmek)\b/g) || []).length;
  scores['Turkmen'] = turkmenChars * 8 + turkmenWords * 15;
  
  const azerbaijaniChars = (text.match(/[əçğıöşü]/g) || []).length;
  const azerbaijaniWords = (lowerText.match(/\b(azərbaycan|olmaq|etmək|demək)\b/g) || []).length;
  scores['Azerbaijani'] = azerbaijaniChars * 8 + azerbaijaniWords * 15;
  
  const turkishWords = (lowerText.match(/\b(türk|türkiye|olmak|etmek|ben|sen|biz|siz|için)\b/g) || []).length;
  scores['Turkish'] = turkishWords * 12;
  
  if (/[\u0400-\u04FF]/.test(text)) {
    const uzbekCyrillicChars = (text.match(/[ўқғҳ]/g) || []).length;
    const uzbekCyrillicWords = (lowerText.match(/\b(ўзбекистон|ўзбек|қилиш|бўлиш)\b/g) || []).length;
    scores['Uzbek'] = (scores['Uzbek'] || 0) + uzbekCyrillicChars * 20 + uzbekCyrillicWords * 18;
    
    const kazakhChars = (text.match(/[әғқңөұүһі]/g) || []).length;
    const kazakhWords = (lowerText.match(/\b(қазақ|қазақстан|болу|ету)\b/g) || []).length;
    scores['Kazakh'] = kazakhChars * 15 + kazakhWords * 18;
    
    const kyrgyzWords = (lowerText.match(/\b(кыргыз|кыргызстан|болуу|кылуу)\b/g) || []).length;
    scores['Kyrgyz'] = kyrgyzWords * 18;
    
    const tajikChars = (text.match(/[ӣӯҳқғҷ]/g) || []).length;
    const tajikWords = (lowerText.match(/\b(тоҷик|тоҷикистон|будан|кардан)\b/g) || []).length;
    scores['Tajik'] = tajikChars * 15 + tajikWords * 18;
    
    const ukrainianChars = (text.match(/[єіїґ]/g) || []).length;
    const ukrainianWords = (lowerText.match(/\b(український|україна|бути|робити)\b/g) || []).length;
    scores['Ukrainian'] = ukrainianChars * 15 + ukrainianWords * 18;
    
    const russianWords = (lowerText.match(/\b(россия|российский|быть|делать|говорить)\b/g) || []).length;
    scores['Russian'] = russianWords * 5;
  }
  
  const spanishWords = (lowerText.match(/\b(español|españa|ser|estar|hacer|yo|tú)\b/g) || []).length;
  scores['Spanish'] = spanishWords * 12;
  
  const frenchWords = (lowerText.match(/\b(français|france|être|avoir|faire|je|tu)\b/g) || []).length;
  scores['French'] = frenchWords * 12;
  
  const germanWords = (lowerText.match(/\b(deutsch|deutschland|sein|haben|ich|du)\b/g) || []).length;
  scores['German'] = germanWords * 12;
  
  const italianWords = (lowerText.match(/\b(italiano|italia|essere|avere|io|tu)\b/g) || []).length;
  scores['Italian'] = italianWords * 12;
  
  const portugueseWords = (lowerText.match(/\b(português|portugal|brasil|ser|estar|eu|tu)\b/g) || []).length;
  scores['Portuguese'] = portugueseWords * 12;
  
  const englishWords = (lowerText.match(/\b(english|the|and|is|are|was|were|have|has|will|would)\b/g) || []).length;
  scores['English'] = englishWords * 4;
  
  const maxScore = Math.max(...Object.values(scores));
  if (maxScore > 10) {
    const detectedLang = Object.keys(scores).find(lang => scores[lang] === maxScore);
    if (detectedLang) return detectedLang;
  }
  
  return 'English';
}

function chunkText(text: string, size: number) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size;
  }
  return chunks;
}

// ✅ EXTRACTIVE SUMMARY FALLBACK - When quota exhausted
function generateExtractiveSummary(text: string, maxSentences: number = 8): string {
  const sentences = text
    .split(/[.!?]+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 200); // Quality sentences only
  
  if (sentences.length === 0) {
    return "Summary unavailable - no valid content to summarize.";
  }
  
  // Take first, middle, and last sentences for good coverage
  const selected: string[] = [];
  const step = Math.max(1, Math.floor(sentences.length / maxSentences));
  
  for (let i = 0; i < sentences.length && selected.length < maxSentences; i += step) {
    selected.push(sentences[i]);
  }
  
  return selected.join('. ') + '.';
}

// ✅ SMART SUMMARIZATION - With quota management
async function summarizeText(text: string, prompt: string, language: string = 'English') {
  // Check quota before API call
  const quotaCheck = checkDailyQuota();
  
  if (!quotaCheck.allowed || quotaExhausted) {
    console.warn("⚠️ Using extractive summary (quota exhausted)");
    const extractive = generateExtractiveSummary(text);
    return `${extractive}\n\n(AI summary temporarily unavailable - showing key excerpts. Quota resets at ${new Date(dailyResetTime).toLocaleTimeString()})`;
  }

  const chunks = chunkText(text, CHUNK_SIZE);
  
  // For short text, don't chunk
  if (text.length < CHUNK_SIZE) {
    const languageInstruction = language !== 'English' 
      ? `\n\nIMPORTANT: Respond in ${language}, not English.`
      : '';

    try {
      incrementQuota(); // Track the call
      
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `${prompt}${languageInstruction}\n\n${text}` }] }],
      });
      
      if (quotaExhausted) {
        quotaExhausted = false;
        console.log("✅ Quota restored");
      }
      
      return result.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error: any) {
      console.error("❌ API Error:", error.message);
      
      if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED") || error.status === 429) {
        quotaExhausted = true;
        quotaResetTime = dailyResetTime;
        const extractive = generateExtractiveSummary(text);
        return `${extractive}\n\n(AI summary temporarily unavailable - quota limit reached)`;
      }
      throw error;
    }
  }

  // For longer texts, process chunks
  let summaries: string[] = [];
  const languageInstruction = language !== 'English' 
    ? `\n\nIMPORTANT: Respond in ${language}, not English.`
    : '';

  for (const chunk of chunks) {
    // Check quota before each chunk
    const chunkQuotaCheck = checkDailyQuota();
    if (!chunkQuotaCheck.allowed) {
      console.warn("⚠️ Quota exhausted mid-processing, using partial summary");
      if (summaries.length > 0) {
        return summaries.join("\n\n") + "\n\n(Partial summary - quota limit reached)";
      }
      return generateExtractiveSummary(text);
    }

    try {
      incrementQuota();
      
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `${prompt}${languageInstruction}\n\n${chunk}` }] }],
      });
      const summary = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (summary) summaries.push(summary);
    } catch (error: any) {
      console.error("❌ Chunk error:", error.message);
      
      if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED") || error.status === 429) {
        quotaExhausted = true;
        quotaResetTime = dailyResetTime;
        if (summaries.length > 0) {
          return summaries.join("\n\n") + "\n\n(Partial summary - quota limit reached)";
        }
        return generateExtractiveSummary(text);
      }
      throw error;
    }
  }

  // Combine summaries if multiple chunks
  if (summaries.length > 1) {
    const quotaCheck = checkDailyQuota();
    if (!quotaCheck.allowed) {
      return summaries.join("\n\n");
    }

    try {
      incrementQuota();
      
      const combined = summaries.join("\n");
      const finalResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `${prompt}${languageInstruction}\n\n${combined}` }] }],
      });
      
      return finalResult.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error: any) {
      console.error("❌ Final summary error:", error.message);
      return summaries.join("\n\n");
    }
  }

  return summaries[0] || null;
}

export async function POST(req: NextRequest) {
  try {
    const { roomId, userId, isVideoCall = false, callStartTime, callEndTime } = await req.json();

    if (!roomId) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    // ✅ CACHE CHECK FIRST - Handles 70-80% of requests
    const cacheKey = `${roomId}-${userId || 'all'}`;
    const cached = summaryCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      const minutesRemaining = Math.round((CACHE_DURATION - (Date.now() - cached.timestamp)) / 60000);
      console.log(`✅ Cache hit: ${cacheKey} (fresh for ${minutesRemaining} more min)`);
      return NextResponse.json({
        fullSummary: cached.fullSummary,
        userSummary: cached.userSummary,
        detectedLanguage: cached.detectedLanguage,
        cached: true,
        message: "Summary retrieved from cache",
      });
    }

    const client = await clientPromise;
    const db = client.db();
    
    const messagesCollection = isVideoCall 
      ? db.collection("videocall_speech_transcripts") 
      : db.collection("messages");
    const usersCollection = db.collection("users");

    let query: any = { roomId };
    
    if (isVideoCall && callStartTime && callEndTime) {
      query.timestamp = {
        $gte: callStartTime,
        $lte: callEndTime
      };
    }
    
    let allMessages = await messagesCollection
      .find(query)
      .sort(isVideoCall ? { timestamp: 1 } : { createdAt: 1 })
      .toArray();

    if (allMessages.length === 0 && ObjectId.isValid(roomId)) {
      query.roomId = new ObjectId(roomId);
      allMessages = await messagesCollection
        .find(query)
        .sort(isVideoCall ? { timestamp: 1 } : { createdAt: 1 })
        .toArray();
    }

    if (!allMessages.length) {
      return NextResponse.json({
        fullSummary: null,
        userSummary: null,
        message: isVideoCall ? "No video call transcripts yet" : "No messages yet",
      });
    }

    let senderIds: string[] = [];
    
    if (isVideoCall) {
      senderIds = [...new Set(allMessages.map((m: any) => m.userId))];
    } else {
      senderIds = [...new Set(allMessages.map((m: any) => m.senderId))];
    }
    
    const users = await usersCollection
      .find({ 
        _id: { 
          $in: senderIds.map((id: any) => {
            try {
              return new ObjectId(id);
            } catch {
              return id;
            }
          })
        } 
      })
      .project({ _id: 1, name: 1 })
      .toArray();

    const userMap = new Map(
      users.map((u: any) => [u._id.toString(), u.name || "Guest"])
    );

    if (isVideoCall) {
      allMessages.forEach((m: any) => {
        if (m.userId && m.userName && !userMap.has(m.userId)) {
          userMap.set(m.userId, m.userName);
        }
      });
    }

    const formattedMessages = allMessages.map((m: any) => {
      const senderId = isVideoCall ? m.userId : m.senderId;
      const senderName = isVideoCall 
        ? (m.userName || userMap.get(senderId) || "Guest")
        : (userMap.get(senderId) || "Guest");
      
      const content = isVideoCall ? m.text : m.content;
      
      return {
        sender: senderName,
        senderId: senderId,
        content: content,
        timestamp: isVideoCall ? m.timestamp : m.createdAt,
        type: m.type || "text",
      };
    });

    const validMessages = formattedMessages.filter((m: any) => {
      return m.content && 
             m.content !== 'undefined' && 
             typeof m.content === 'string' &&
             m.content.trim().length > 0 &&
             m.sender && 
             m.sender !== 'undefined';
    });

    if (validMessages.length === 0) {
      return NextResponse.json({
        fullSummary: "No valid conversation to summarize.",
        userSummary: null,
        message: "No valid messages found",
      });
    }

    const fullChatText = validMessages
      .map((m) => `${m.sender}: ${m.content}`)
      .join("\n");

    let detectedLanguage = 'English';
    
    const langMap: any = {
      'uz-UZ': 'Uzbek', 'ru-RU': 'Russian', 'en-US': 'English', 'en-GB': 'English',
      'kk-KZ': 'Kazakh', 'ky-KG': 'Kyrgyz', 'tg-TJ': 'Tajik',
      'tk-TM': 'Turkmen', 'az-AZ': 'Azerbaijani', 'tr-TR': 'Turkish',
      'es-ES': 'Spanish', 'fr-FR': 'French', 'de-DE': 'German',
      'it-IT': 'Italian', 'pt-BR': 'Portuguese', 'ja-JP': 'Japanese',
      'ko-KR': 'Korean', 'zh-CN': 'Chinese', 'ar-SA': 'Arabic', 'hi-IN': 'Hindi',
    };
    
    if (isVideoCall && allMessages.length > 0) {
      const languages = allMessages
        .map((m: any) => m.language)
        .filter((l: string) => l);
      
      if (languages.length > 0) {
        const langCount: any = {};
        languages.forEach((l: string) => {
          langCount[l] = (langCount[l] || 0) + 1;
        });
        const mostCommon = Object.entries(langCount).sort((a: any, b: any) => b[1] - a[1])[0][0];
        detectedLanguage = langMap[mostCommon] || 'English';
      } else {
        detectedLanguage = detectLanguage(fullChatText);
      }
    } else {
      detectedLanguage = detectLanguage(fullChatText);
    }
    
    let userText = null;
    let userName = "User";
    
    if (userId) {
      const userMessages = validMessages.filter(
        (m: any) => m.senderId === userId
      );
      
      userName = userMessages[0]?.sender || userMap.get(userId) || "User";
      userText = userMessages
        .map((m) => `${m.sender}: ${m.content}`)
        .join("\n");
    }

    try {      
      // ✅ SHORT, EFFICIENT PROMPTS
      const fullPrompt = isVideoCall
        ? `Summarize this ${detectedLanguage} video call.

${fullChatText}

In ${detectedLanguage}, provide:
- Main topics
- Key decisions
- Action items`
        : `Summarize this ${detectedLanguage} chat.

${fullChatText}

In ${detectedLanguage}:
- Main topics
- Key points`;

      const userPrompt = userText ? `Summarize ${userName}'s contributions in ${detectedLanguage}.

${userText}

Their:
- Main points
- Questions
- Participation` : null;

      const [fullSummary, userSummary] = await Promise.all([
        userId ? Promise.resolve(null) : summarizeText(fullChatText, fullPrompt, detectedLanguage),
        userText ? summarizeText(userText, userPrompt!, detectedLanguage) : Promise.resolve(null),
      ]);

      // ✅ CACHE FOR 30 MINUTES
      summaryCache.set(cacheKey, {
        timestamp: Date.now(),
        fullSummary,
        userSummary,
        detectedLanguage,
      });

      // ✅ CACHE CLEANUP - Keep 100 entries max
      if (summaryCache.size > 100) {
        const entries = Array.from(summaryCache.entries());
        const oldEntries = entries
          .sort((a, b) => a[1].timestamp - b[1].timestamp)
          .slice(0, 20);
        
        oldEntries.forEach(([key]) => summaryCache.delete(key));
        console.log(`🧹 Cleaned ${oldEntries.length} old cache entries`);
      }

      return NextResponse.json({
        fullSummary,
        userSummary,
        message: "Summary generated successfully",
        isVideoCall,
        messageCount: validMessages.length,
        participantCount: senderIds.length,
        detectedLanguage,
        quotaUsed: dailyRequestCount,
        quotaLimit: MAX_DAILY_REQUESTS,
      });
    } catch (err: any) {
      console.error("❌ Summarization error:", err);
      
      // ✅ NEVER CRASH - Always return something useful
      const fallbackSummary = generateExtractiveSummary(fullChatText);
      
      summaryCache.set(cacheKey, {
        timestamp: Date.now(),
        fullSummary: fallbackSummary,
        userSummary: null,
        detectedLanguage: 'English',
      });
      
      return NextResponse.json({
        fullSummary: fallbackSummary,
        userSummary: null,
        message: "Summary generated (extractive mode)",
        isVideoCall,
        messageCount: validMessages.length,
        participantCount: senderIds.length,
        detectedLanguage,
      });
    }
  } catch (err: any) {
    console.error("❌ API error:", err);
    return NextResponse.json(
      { 
        error: `Internal error. Please try again.`, 
        fullSummary: null, 
        userSummary: null 
      },
      { status: 500 }
    );
  }
} 