// app/api/summarize/route.ts
// COMPLETE UPDATED VERSION WITH MULTILINGUAL SUPPORT

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });
const CHUNK_SIZE = 1000;

// Smart multilingual language detection with better scoring
function detectLanguage(text: string): string {
  if (!text || text.length < 10) return "English";
  const lowerText = text.toLowerCase();

  // 1. NON-LATIN/NON-CYRILLIC (True unique scripts - leave these as immediate)
  if (/[\u4e00-\u9fa5]/.test(text)) return "Chinese";
  if (/[\u0600-\u06FF]/.test(text)) return "Arabic";
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return "Japanese";
  if (/[\uAC00-\uD7AF]/.test(text)) return "Korean";
  if (/[\u0E00-\u0E7F]/.test(text)) return "Thai";
  if (/[\u0590-\u05FF]/.test(text)) return "Hebrew";

  // 2. INITIALIZE SCORES
  const scores: { [key: string]: number } = {
    English: 0,
    Uzbek: 0,
    Russian: 0,
    Spanish: 0,
    Portuguese: 0,
    French: 0,
    German: 0,
    Italian: 0,
    Turkish: 0,
    Kazakh: 0,
    Ukrainian: 0,
    Tajik: 0,
    Azerbaijani: 0,
  };

  // 3. SCORE LATIN & COMMON PATTERNS (Standard weight: 10)
  const latinPatterns: { [key: string]: RegExp } = {
    English:
      /\b(the|and|this|that|with|from|have|would|should|could|hello|start|are|was|were|is|you|your|we|our|they|their|it|its|be|been|has|had|do|does|did|will|can|may|but|or|if|so|as|at|by|an)\b/gi,
    Uzbek:
      /\b(o'zbekiston|bo'lish|qilish|shunday|bugun|hozir|rahmat|salom)\b/gi,
    Turkish: /\b(türkiye|olmak|etmek|nasıl|neden|için|teşekkür)\b/gi,
    Spanish: /\b(español|hacer|decir|pero|para|con|este|gracias)\b/gi,
    Portuguese: /\b(português|fazer|dizer|você|então|muito|obrigado)\b/gi,
    French: /\b(français|faire|dire|dans|pour|avec|quel|merci)\b/gi,
    German: /\b(deutsch|machen|sagen|nicht|aber|alles|danke)\b/gi,
    Italian: /\b(italiano|fare|dire|questo|perché|tutto|grazie)\b/gi,
    Azerbaijani: /\b(azərbaycan|olmaq|etmək|necə|niyə|təşəkkür)\b/gi,
  };

  Object.keys(latinPatterns).forEach((lang) => {
    scores[lang] = (lowerText.match(latinPatterns[lang]) || []).length * 10;
  });

  // 4. SCORE CYRILLIC PATTERNS (Only if Cyrillic characters are present)
  if (/[\u0400-\u04FF]/.test(text)) {
    // Unique characters for specific languages
    scores["Uzbek"] += (text.match(/[ўқғҳ]/g) || []).length * 15;
    scores["Kazakh"] += (text.match(/[әғқңөұүһі]/g) || []).length * 15;
    scores["Tajik"] += (text.match(/[ӣӯҳқғҷ]/g) || []).length * 15;
    scores["Ukrainian"] += (text.match(/[єіїґ]/g) || []).length * 15;

    // Russian common words (Standard weight)
    const russianWords = (
      lowerText.match(
        /\b(и|в|не|на|я|быть|что|с|а|по|это|как|так|все|его|для|или|ты)\b/g,
      ) || []
    ).length;
    scores["Russian"] = russianWords * 10;
  }

  // 5. UZBEK LATIN SPECIAL CASE (Apostrophes are very heavy indicators)
  const uzbekApostrophe = (text.match(/\b(o'|g'|O'|G')\w/g) || []).length;
  scores["Uzbek"] += uzbekApostrophe * 15;

  // 6. CALCULATE WINNER
  let winner = "English";
  let maxScore = 0;

  for (const [lang, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      winner = lang;
    }
  }

  // Default to English if the match is too weak (avoids false positives)
  return maxScore >= 10 ? winner : "English";
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

// ✅ MODIFIED: Added language parameter
async function summarizeText(
  text: string,
  prompt: string,
  language: string = "English",
) {
  const chunks = chunkText(text, CHUNK_SIZE);
  let summaries: string[] = [];

  const languageInstruction = `
[SYSTEM RULE: MANDATORY LANGUAGE]
The user's conversation is in ${language}. 
You MUST write the entire summary in ${language}. 
Do not provide any part of the response in English or Portuguese unless that is the detected language.
`;

  for (const chunk of chunks) {
    try {
      const result = await ai.models.generateContent({
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
      console.error("❌ Chunk summarization error:", error);

      if (
        error.message?.includes("quota") ||
        error.message?.includes("RESOURCE_EXHAUSTED")
      ) {
        console.warn("⚠️ Quota exceeded, returning basic summary");
        return `Summary unavailable due to API quota limits. Here are the raw messages:\n\n${text.substring(0, 500)}...`;
      }
      throw error;
    }
  }

  if (summaries.length > 1) {
    try {
      const combined = summaries.join("\n");
      const finalResult = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [
          {
            role: "user",
            parts: [{ text: `${prompt}${languageInstruction}\n\n${combined}` }],
          },
        ],
      });
      return finalResult.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error: any) {
      console.error("❌ Final summarization error:", error);
      return summaries.join("\n\n");
    }
  }

  return summaries[0] || null;
}

export async function POST(req: NextRequest) {
  try {
    const {
      roomId,
      userId,
      isVideoCall = false,
      callStartTime,
      callEndTime,
      overrideLanguage,
    } = await req.json();

    console.log("📥 Summarize request:", {
      roomId,
      userId,
      isVideoCall,
      roomIdType: typeof roomId,
    });

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    const client = await clientPromise;
    const db = client.db();

    // Choose collection based on type
    const messagesCollection = isVideoCall
      ? db.collection("videocall_speech_transcripts")
      : db.collection("messages");
    const usersCollection = db.collection("users");

    // Fetch all messages in the room
    let query: any = { roomId };

    // If video call, optionally filter by time range
    if (isVideoCall && callStartTime && callEndTime) {
      query.timestamp = {
        $gte: callStartTime,
        $lte: callEndTime,
      };
    }

    console.log("🔍 Query:", query);

    let allMessages = await messagesCollection
      .find(query)
      .sort(isVideoCall ? { timestamp: 1 } : { createdAt: 1 })
      .toArray();

    console.log(`📊 Found ${allMessages.length} messages with string query`);

    // If no results with string, try ObjectId
    if (allMessages.length === 0 && ObjectId.isValid(roomId)) {
      console.log("🔍 Trying ObjectId query...");
      query.roomId = new ObjectId(roomId);
      allMessages = await messagesCollection
        .find(query)
        .sort(isVideoCall ? { timestamp: 1 } : { createdAt: 1 })
        .toArray();
      console.log(
        `📊 Found ${allMessages.length} messages with ObjectId query`,
      );
    }

    if (!allMessages.length) {
      return NextResponse.json({
        fullSummary: null,
        userSummary: null,
        message: isVideoCall
          ? "No video call transcripts yet"
          : "No messages yet",
      });
    }

    // Get user names for better context
    let senderIds: string[] = [];

    if (isVideoCall) {
      senderIds = [...new Set(allMessages.map((m: any) => m.userId))];
    } else {
      senderIds = [...new Set(allMessages.map((m: any) => m.senderId))];
    }

    console.log("👥 Unique sender IDs:", senderIds);

    const users = await usersCollection
      .find({
        _id: {
          $in: senderIds.map((id: any) => {
            try {
              return new ObjectId(id);
            } catch {
              return id;
            }
          }),
        },
      })
      .project({ _id: 1, name: 1 })
      .toArray();

    console.log("👥 Found users:", users.length);

    const userMap = new Map(
      users.map((u: any) => [u._id.toString(), u.name || "Guest"]),
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
        ? m.userName || userMap.get(senderId) || "Guest"
        : userMap.get(senderId) || "Guest";

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
      return (
        m.content &&
        m.content !== "undefined" &&
        typeof m.content === "string" &&
        m.content.trim().length > 0 &&
        m.sender &&
        m.sender !== "undefined"
      );
    });

    console.log(
      `📊 Total messages: ${formattedMessages.length}, Valid: ${validMessages.length}`,
    );

    if (validMessages.length === 0) {
      return NextResponse.json({
        fullSummary:
          "No valid conversation to summarize. Please ensure the conversation has started.",
        userSummary: null,
        message: "No valid messages found",
      });
    }

    const fullChatText = validMessages
      .map((m) => `${m.sender}: ${m.content}`)
      .join("\n");

    console.log("📝 Full chat text length:", fullChatText.length);
    console.log("📝 First 500 chars:", fullChatText.substring(0, 500));
    console.log(
      "📝 Language detection sample:",
      fullChatText.substring(0, 200),
    );

    // ✅ SMART AUTO-DETECTION: Try multiple methods to find the language
    let detectedLanguage = "English";

    // Map language codes to full names
    const langMap: any = {
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

    if (overrideLanguage) {
      // User explicitly selected a language — use it directly
      detectedLanguage = langMap[overrideLanguage] || "English";
      console.log(`🌍 Using user-selected language: ${detectedLanguage}`);
    } else if (isVideoCall && allMessages.length > 0) {
      // Video call without override — check transcript metadata
      const languages = allMessages
        .map((m: any) => m.language)
        .filter((l: string) => l);
      if (languages.length > 0) {
        const langCount: any = {};
        languages.forEach((l: string) => {
          langCount[l] = (langCount[l] || 0) + 1;
        });
        const mostCommon = Object.entries(langCount).sort(
          (a: any, b: any) => b[1] - a[1],
        )[0][0];
        detectedLanguage = langMap[mostCommon] || "English";
      } else {
        detectedLanguage = detectLanguage(fullChatText);
      }
    } else {
      // Regular chat — auto detect
      detectedLanguage = detectLanguage(fullChatText);
    }
    console.log(`🌍 Final language for summary: ${detectedLanguage}`);

    // Filter by userId if provided
    let userText = null;
    let userName = "User";

    if (userId) {
      const userMessages = validMessages.filter(
        (m: any) => m.senderId === userId,
      );

      userName = userMessages[0]?.sender || userMap.get(userId) || "User";
      userText = userMessages
        .map((m) => `${m.sender}: ${m.content}`)
        .join("\n");

      console.log(`📝 User ${userName} messages count:`, userMessages.length);
    }

    try {
      console.log("🤖 Starting AI summarization...");

      // ✅ MODIFIED: Multilingual prompts
      const fullPrompt = isVideoCall
        ? `You are summarizing a video call conversation. The conversation is in ${detectedLanguage}.

Conversation:
${fullChatText}

Please provide a comprehensive summary in ${detectedLanguage} (the SAME language as the conversation) including:
1. Main Topics Discussed (bullet points)
2. Key Decisions Made (if any)
3. Action Items (if any)
4. Overall Summary (2-3 paragraphs)

CRITICAL: Respond in ${detectedLanguage}, NOT in English. Match the language of the conversation exactly.`
        : `You are summarizing a chat conversation. The conversation is in ${detectedLanguage}.

Conversation:
${fullChatText}

Provide a concise summary in ${detectedLanguage} (the SAME language as the conversation) including:
- Main topics discussed
- Key points and decisions
- Important questions or concerns

CRITICAL: Respond in ${detectedLanguage}, NOT in English.`;

      const userPrompt = isVideoCall
        ? `You are summarizing one person's contributions in a video call. The conversation is in ${detectedLanguage}.

${userName}'s statements:
${userText}

Provide a summary in ${detectedLanguage} (the SAME language as their statements) focusing on:
1. Their main talking points
2. Questions they asked
3. Decisions or suggestions they made
4. Their level of participation

CRITICAL: Respond in ${detectedLanguage}, NOT in English. Use the same language as ${userName}'s statements.`
        : `You are summarizing messages from ${userName}. The messages are in ${detectedLanguage}.

${userName}'s messages:
${userText}

Provide a concise summary in ${detectedLanguage} (the SAME language as their messages) including:
- Their main contributions
- Questions they raised
- Key points they made

CRITICAL: Respond in ${detectedLanguage}, NOT in English.`;

      // Run summaries in parallel if userText exists
      const [fullSummary, userSummary] = await Promise.all([
        userId
          ? Promise.resolve(null)
          : summarizeText(fullChatText, fullPrompt, detectedLanguage),
        userText
          ? summarizeText(userText, userPrompt, detectedLanguage)
          : Promise.resolve(null),
      ]);

      console.log("✅ Summaries generated successfully");

      return NextResponse.json({
        fullSummary,
        userSummary,
        message: "Summary generated successfully",
        isVideoCall,
        messageCount: validMessages.length,
        participantCount: senderIds.length,
        detectedLanguage, // ✅ ADDED: Return detected language
      });
    } catch (err: any) {
      console.error("❌ Summarization AI error:", err);

      if (
        err.message?.includes("quota") ||
        err.message?.includes("RESOURCE_EXHAUSTED")
      ) {
        return NextResponse.json(
          {
            error:
              "API quota exceeded. Please try again later or upgrade your plan.",
            fullSummary: null,
            userSummary: null,
          },
          { status: 429 },
        );
      }

      return NextResponse.json(
        {
          error: `Summarization failed: ${err.message}`,
          fullSummary: null,
          userSummary: null,
        },
        { status: 500 },
      );
    }
  } catch (err: any) {
    console.error("❌ API error:", err);
    return NextResponse.json(
      {
        error: `Internal server error: ${err.message}`,
        details: err.stack,
        fullSummary: null,
        userSummary: null,
      },
      { status: 500 },
    );
  }
}
