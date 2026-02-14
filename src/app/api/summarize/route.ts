// app/api/summarize/route.ts
// COMPLETE UPDATED VERSION WITH MULTILINGUAL SUPPORT

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });
const CHUNK_SIZE = 1000;

// ✅ GREATLY IMPROVED: Smart multilingual language detection with better scoring
function detectLanguage(text: string): string {
  if (!text || text.length < 10) return 'English';
  
  const lowerText = text.toLowerCase();
  const scores: { [key: string]: number } = {};

  // Character set detection (high confidence - immediate return)
  if (/[\u4e00-\u9fa5]/.test(text)) return 'Chinese';
  if (/[\u0600-\u06FF]/.test(text)) return 'Arabic';
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'Japanese';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'Korean';
  if (/[\u0E00-\u0E7F]/.test(text)) return 'Thai';
  if (/[\u0590-\u05FF]/.test(text)) return 'Hebrew';
  if (/[\u0370-\u03FF]/.test(text)) return 'Greek';
  
  // ✅ CRITICAL FIX: Latin-based languages FIRST (before Cyrillic)
  // This prevents Cyrillic from overriding Latin script languages
  
  // Uzbek Latin - VERY specific patterns
  const uzbekLatinPatterns = [
    /\b(o'zbekiston|o'zbek|bo'lish|qilish|qilmoq|bo'lmoq|kerak|mumkin|shunday|bugun|ertaga|kecha|hozir)\b/gi,
    /\b(salom|xayr|rahmat|iltimos|ha|yo'q|nima|qanday|qachon|qayer|kim|nima\s+uchun)\b/gi,
    /\b(men|sen|u|biz|siz|ular|mening|sening|uning|bizning|sizning|ularning)\b/gi,
    /\b(qil|bo'l|ol|ber|ket|kel|o'qi|yoz|gap|ish|kun|vaqt|joy)\b/gi,
  ];
  
  let uzbekLatinScore = 0;
  uzbekLatinPatterns.forEach(pattern => {
    uzbekLatinScore += (lowerText.match(pattern) || []).length * 15;
  });
  
  // Apostrophe usage is VERY characteristic of Uzbek Latin
  const apostropheCount = (text.match(/[a-z]'[a-z]/gi) || []).length;
  uzbekLatinScore += apostropheCount * 10;
  
  scores['Uzbek'] = uzbekLatinScore;
  
  // Turkmen - specific characters and words
  const turkmenChars = (text.match(/[şžäňöüý]/g) || []).length;
  const turkmenWords = (lowerText.match(/\b(türkmen|türkmenistan|bolmak|etmek|diýmek|men|sen|ol|biz|siz|olar|hem|üçin)\b/g) || []).length;
  scores['Turkmen'] = turkmenChars * 8 + turkmenWords * 15;
  
  // Azerbaijani - specific patterns
  const azerbaijaniChars = (text.match(/[əçğıöşü]/g) || []).length;
  const azerbaijaniWords = (lowerText.match(/\b(azərbaycan|olmaq|etmək|demək|mən|sən|o|biz|siz|onlar|və|üçün|necə|nə|kim|niyə)\b/g) || []).length;
  scores['Azerbaijani'] = azerbaijaniChars * 8 + azerbaijaniWords * 15;
  
  // Turkish - specific patterns
  const turkishWords = (lowerText.match(/\b(türk|türkiye|olmak|etmek|demek|ben|sen|o|biz|siz|onlar|ve|için|nasıl|ne|kim|neden|niye|şey|gibi|çok|var|yok)\b/g) || []).length;
  scores['Turkish'] = turkishWords * 12;
  
  // ✅ NOW check Cyrillic (after Latin languages scored)
  if (/[\u0400-\u04FF]/.test(text)) {
    // Uzbek Cyrillic - VERY specific characters
    const uzbekCyrillicChars = (text.match(/[ўқғҳ]/g) || []).length;
    const uzbekCyrillicWords = (lowerText.match(/\b(ўзбекистон|ўзбек|қилиш|қилмоқ|бўлиш|бўлмоқ|керак|мумкин|шундай|бугун|эртага|кеча|ҳозир)\b/g) || []).length;
    scores['Uzbek'] = (scores['Uzbek'] || 0) + uzbekCyrillicChars * 20 + uzbekCyrillicWords * 18;
    
    // Kazakh - specific characters
    const kazakhChars = (text.match(/[әғқңөұүһі]/g) || []).length;
    const kazakhWords = (lowerText.match(/\b(қазақ|қазақстан|болу|ету|айту|мен|сен|ол|біз|сіз|олар|және|үшін|қалай|не|кім|неге|неліктен)\b/g) || []).length;
    scores['Kazakh'] = kazakhChars * 15 + kazakhWords * 18;
    
    // Kyrgyz
    const kyrgyzWords = (lowerText.match(/\b(кыргыз|кыргызстан|болуу|кылуу|айтуу|мен|сен|ал|биз|силер|алар|жана|үчүн|кандай|эмне|ким|эмнеге)\b/g) || []).length;
    scores['Kyrgyz'] = kyrgyzWords * 18;
    
    // Tajik - specific characters and words
    const tajikChars = (text.match(/[ӣӯҳқғҷ]/g) || []).length;
    const tajikWords = (lowerText.match(/\b(тоҷик|тоҷикистон|будан|кардан|гуфтан|ман|ту|ӯ|мо|шумо|онҳо|ва|барои|чӣ|кӣ|чаро)\b/g) || []).length;
    scores['Tajik'] = tajikChars * 15 + tajikWords * 18;
    
    // Ukrainian
    const ukrainianChars = (text.match(/[єіїґ]/g) || []).length;
    const ukrainianWords = (lowerText.match(/\b(український|україна|бути|робити|казати|я|ти|він|вона|воно|ми|ви|вони|і|та|для|як|що|хто|чому)\b/g) || []).length;
    scores['Ukrainian'] = ukrainianChars * 15 + ukrainianWords * 18;
    
    // Russian - ONLY if no other Cyrillic language detected
    // Use VERY specific Russian-only words (not shared with other Cyrillic languages)
    const russianOnlyWords = (lowerText.match(/\b(россия|российский|быть|делать|говорить|сказать|я|ты|он|она|оно|мы|вы|они|это|этот|тот|который|такой|весь|самый|другой|новый|большой|должен|можно|нужно|хорошо|плохо|здесь|там|сейчас|потом|всегда|никогда|очень|более|менее|если|когда|где|куда|откуда|почему|зачем|как|чтобы|или|либо|ведь|даже|уже|еще|только|просто|конечно|наверное|может|будет|есть|нет)\b/g) || []).length;
    scores['Russian'] = russianOnlyWords * 5; // MUCH lower weight than before
  }
  
  // Spanish - specific words
  const spanishWords = (lowerText.match(/\b(español|españa|ser|estar|hacer|decir|yo|tú|él|ella|nosotros|vosotros|ellos|ellas|el|la|los|las|un|una|y|o|pero|de|en|por|para|con|qué|cómo|cuándo|dónde|quién|por\s+qué|porque|muy|más|menos|todo|nada|algo|siempre|nunca)\b/g) || []).length;
  scores['Spanish'] = spanishWords * 12;
  
  // French  
  const frenchWords = (lowerText.match(/\b(français|france|être|avoir|faire|dire|je|tu|il|elle|nous|vous|ils|elles|le|la|les|un|une|des|et|ou|mais|de|à|dans|pour|avec|ce|cette|quel|comment|quand|où|qui|pourquoi|parce\s+que|très|plus|moins|tout|rien|quelque|toujours|jamais)\b/g) || []).length;
  scores['French'] = frenchWords * 12;
  
  // German
  const germanWords = (lowerText.match(/\b(deutsch|deutschland|sein|haben|machen|sagen|ich|du|er|sie|es|wir|ihr|der|die|das|ein|eine|und|oder|aber|von|in|zu|für|mit|dieser|welcher|wie|was|wann|wo|wer|warum|weil|sehr|mehr|weniger|alles|nichts|etwas|immer|niemals)\b/g) || []).length;
  scores['German'] = germanWords * 12;
  
  // Italian
  const italianWords = (lowerText.match(/\b(italiano|italia|essere|avere|fare|dire|io|tu|lui|lei|noi|voi|loro|il|lo|la|un|una|e|o|ma|di|in|per|con|questo|quale|come|cosa|quando|dove|chi|perché|perchè|molto|più|meno|tutto|niente|qualcosa|sempre|mai)\b/g) || []).length;
  scores['Italian'] = italianWords * 12;
  
  // Portuguese
  const portugueseWords = (lowerText.match(/\b(português|portugal|brasil|ser|estar|ter|fazer|dizer|eu|tu|você|ele|ela|nós|vós|vocês|eles|elas|o|a|os|as|um|uma|e|ou|mas|de|em|por|para|com|este|qual|como|o\s+que|quando|onde|quem|por\s+que|porque|muito|mais|menos|tudo|nada|algo|sempre|nunca)\b/g) || []).length;
  scores['Portuguese'] = portugueseWords * 12;
  
  // English - ONLY very specific English words
  const englishWords = (lowerText.match(/\b(english|the|a|an|and|or|but|of|in|to|for|with|this|that|these|those|what|when|where|how|why|who|which|i|you|he|she|it|we|they|am|is|are|was|were|been|being|have|has|had|do|does|did|will|would|could|should|can|may|might|must|very|more|most|all|some|any|no|not|yes|always|never|sometimes|here|there|now|then)\b/g) || []).length;
  scores['English'] = englishWords * 4; // Lower weight
  
  // ✅ Calculate winner
  const maxScore = Math.max(...Object.values(scores));
  
  console.log('🔍 Language detection scores:', scores);
  console.log('🔍 Text sample (first 300 chars):', text.substring(0, 300));
  
  if (maxScore > 10) { // Increased threshold for confidence
    const detectedLang = Object.keys(scores).find(lang => scores[lang] === maxScore);
    if (detectedLang) {
      console.log(`✅ Detected language: ${detectedLang} (score: ${maxScore})`);
      return detectedLang;
    }
  }
  
  console.log('⚠️ No clear language detected, defaulting to English');
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

// ✅ MODIFIED: Added language parameter
async function summarizeText(text: string, prompt: string, language: string = 'English') {
  const chunks = chunkText(text, CHUNK_SIZE);
  let summaries: string[] = [];

  // ✅ ADDED: Language instruction
  const languageInstruction = language !== 'English' 
    ? `\n\nIMPORTANT: The conversation is in ${language}. You MUST respond in ${language}, not English.`
    : '';

  for (const chunk of chunks) {
    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `${prompt}${languageInstruction}\n\n${chunk}` }] }],
      });
      const summary = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (summary) summaries.push(summary);
    } catch (error: any) {
      console.error("❌ Chunk summarization error:", error);
      
      if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
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
        contents: [{ role: "user", parts: [{ text: `${prompt}${languageInstruction}\n\n${combined}` }] }],
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
    const { roomId, userId, isVideoCall = false, callStartTime, callEndTime } = await req.json();

    console.log("📥 Summarize request:", { roomId, userId, isVideoCall, roomIdType: typeof roomId });

    if (!roomId) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
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
        $lte: callEndTime
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
      console.log(`📊 Found ${allMessages.length} messages with ObjectId query`);
    }

    if (!allMessages.length) {
      return NextResponse.json({
        fullSummary: null,
        userSummary: null,
        message: isVideoCall ? "No video call transcripts yet" : "No messages yet",
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
          })
        } 
      })
      .project({ _id: 1, name: 1 })
      .toArray();

    console.log("👥 Found users:", users.length);

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

    console.log(`📊 Total messages: ${formattedMessages.length}, Valid: ${validMessages.length}`);

    if (validMessages.length === 0) {
      return NextResponse.json({
        fullSummary: "No valid conversation to summarize. Please ensure the conversation has started.",
        userSummary: null,
        message: "No valid messages found",
      });
    }

    const fullChatText = validMessages
      .map((m) => `${m.sender}: ${m.content}`)
      .join("\n");

    console.log("📝 Full chat text length:", fullChatText.length);
    console.log("📝 First 500 chars:", fullChatText.substring(0, 500));
    console.log("📝 Language detection sample:", fullChatText.substring(0, 200));

    // ✅ SMART AUTO-DETECTION: Try multiple methods to find the language
    let detectedLanguage = 'English';
    
    // Map language codes to full names
    const langMap: any = {
      'uz-UZ': 'Uzbek', 'ru-RU': 'Russian', 'en-US': 'English', 'en-GB': 'English',
      'kk-KZ': 'Kazakh', 'ky-KG': 'Kyrgyz', 'tg-TJ': 'Tajik',
      'tk-TM': 'Turkmen', 'az-AZ': 'Azerbaijani', 'tr-TR': 'Turkish',
      'es-ES': 'Spanish', 'fr-FR': 'French', 'de-DE': 'German',
      'it-IT': 'Italian', 'pt-BR': 'Portuguese', 'ja-JP': 'Japanese',
      'ko-KR': 'Korean', 'zh-CN': 'Chinese', 'ar-SA': 'Arabic', 'hi-IN': 'Hindi',
    };
    
    // For video calls, check transcript metadata first
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
        console.log(`✅ Using language from video transcripts: ${detectedLanguage} (${languages.length} transcripts had metadata)`);
      } else {
        detectedLanguage = detectLanguage(fullChatText);
      }
    } 
    // For regular chat, use smart text detection
    else {
      detectedLanguage = detectLanguage(fullChatText);
    }
    
    console.log(`🌍 Final language for summary: ${detectedLanguage}`);

    // Filter by userId if provided
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
      
      if (err.message?.includes("quota") || err.message?.includes("RESOURCE_EXHAUSTED")) {
        return NextResponse.json({
          error: "API quota exceeded. Please try again later or upgrade your plan.",
          fullSummary: null,
          userSummary: null,
        }, { status: 429 });
      }
      
      return NextResponse.json(
        { 
          error: `Summarization failed: ${err.message}`, 
          fullSummary: null, 
          userSummary: null 
        },
        { status: 500 }
      );
    }
  } catch (err: any) {
    console.error("❌ API error:", err);
    return NextResponse.json(
      { 
        error: `Internal server error: ${err.message}`, 
        details: err.stack,
        fullSummary: null, 
        userSummary: null 
      },
      { status: 500 }
    );
  }
}