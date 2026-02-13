// app/api/suggest-response/route.ts
// OPTIMIZED VERSION WITH QUOTA MANAGEMENT + MULTILINGUAL SUPPORT

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

// ✅ Enhanced caching with longer duration
const requestCache = new Map<string, { timestamp: number; suggestions: string[]; language: string }>();
const CACHE_DURATION = 2 * 60 * 1000; // 2 minutes cache (increased from 30s)
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

// ✅ LANGUAGE DETECTION (same as summarize/route.ts)
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

// ✅ MULTILINGUAL FALLBACK SUGGESTIONS
function generateFallbackSuggestions(
  recentMessages: any[],
  userId: string,
  userMap: Map<string, string>,
  language: string = 'English'
): string[] {
  const userMessageCount = recentMessages.filter((m: any) => m.senderId === userId).length;
  
  // Language-specific fallbacks
  const fallbacks: { [key: string]: { greeting: string[], question: string[], general: string[] } } = {
    'Uzbek': {
      greeting: [
        "Salom hammaga! Ishtirok etganim uchun rahmat.",
        "Assalomu alaykum! Muhokamamizni boshlaylik.",
        "Salom! Nimadan boshlashimiz kerak?",
        "Hammangiz bilan tanishganimdan xursandman!"
      ],
      question: [
        "Bu juda yaxshi savol. Keling, o'ylab ko'raylik.",
        "Yaxshi fikr! Mening fikrimcha...",
        "Buni tushuntirishga tayyorman.",
        "Bosqichma-bosqich tushuntirib beraman.",
        "Savol berganingiz uchun rahmat - mening nuqtai nazarim..."
      ],
      general: [
        "Sizning fikringiz bilan roziman.",
        "Bu haqda ko'proq ma'lumot bera olasizmi?",
        "Bu mantiqiy. Keyingi qadam nima?",
        "Tushundim. Qanday davom ettiramiz?",
        "Bu fikrni baham ko'rganingiz uchun rahmat."
      ]
    },
    'Russian': {
      greeting: [
        "Привет всем! Рад быть здесь.",
        "Здравствуйте! С нетерпением жду нашего обсуждения.",
        "Привет! С чего начнем?",
        "Рад познакомиться со всеми!"
      ],
      question: [
        "Это отличный вопрос. Давайте подумаем.",
        "Хороший вопрос! Вот что я думаю...",
        "С удовольствием поясню это.",
        "Позвольте объяснить это пошагово.",
        "Спасибо за вопрос - вот моя точка зрения..."
      ],
      general: [
        "Я согласен с этим подходом.",
        "Не могли бы вы уточнить этот момент?",
        "Это имеет смысл. Что дальше?",
        "Понимаю. Как нам продолжить?",
        "Спасибо за эту информацию."
      ]
    },
    'Turkish': {
      greeting: [
        "Herkese merhaba! Burada olmaktan mutluyum.",
        "Merhaba! Tartışmamızı sabırsızlıkla bekliyorum.",
        "Selam! Neyle başlamalıyız?",
        "Hepinizle tanıştığıma memnun oldum!"
      ],
      question: [
        "Bu harika bir soru. Düşünelim.",
        "Güzel soru! İşte düşüncelerim...",
        "Bunu açıklamaktan memnuniyet duyarım.",
        "Bunu adım adım açıklayayım.",
        "Sorduğunuz için teşekkürler - işte benim görüşüm..."
      ],
      general: [
        "Bu yaklaşıma katılıyorum.",
        "Bu konuyu biraz daha açabilir misiniz?",
        "Bu mantıklı. Sıradaki adım ne?",
        "Anlıyorum. Nasıl devam edelim?",
        "Bu görüşü paylaştığınız için teşekkürler."
      ]
    },
    'Spanish': {
      greeting: [
        "¡Hola a todos! Encantado de estar aquí.",
        "¡Hola! Estoy deseando nuestra discusión.",
        "¡Hola! ¿Por dónde empezamos?",
        "¡Encantado de conocerlos a todos!"
      ],
      question: [
        "Esa es una gran pregunta. Pensemos en ello.",
        "¡Buen punto! Esto es lo que pienso...",
        "Estaré encantado de aclarar eso.",
        "Déjame explicarlo paso a paso.",
        "Gracias por preguntar - aquí está mi perspectiva..."
      ],
      general: [
        "Estoy de acuerdo con ese enfoque.",
        "¿Podrías elaborar sobre ese punto?",
        "Tiene sentido. ¿Cuál es el siguiente paso?",
        "Entiendo. ¿Cómo procedemos?",
        "Gracias por compartir esa información."
      ]
    },
    'French': {
      greeting: [
        "Bonjour à tous ! Ravi d'être ici.",
        "Bonjour ! J'ai hâte de notre discussion.",
        "Salut ! Par quoi commençons-nous ?",
        "Ravi de vous rencontrer tous !"
      ],
      question: [
        "C'est une excellente question. Réfléchissons.",
        "Bon point ! Voici ce que je pense...",
        "Je serais ravi de clarifier cela.",
        "Laissez-moi expliquer étape par étape.",
        "Merci de demander - voici mon point de vue..."
      ],
      general: [
        "Je suis d'accord avec cette approche.",
        "Pourriez-vous développer ce point ?",
        "C'est logique. Quelle est la prochaine étape ?",
        "Je comprends. Comment procédons-nous ?",
        "Merci de partager cette information."
      ]
    },
    'German': {
      greeting: [
        "Hallo alle zusammen! Schön, hier zu sein.",
        "Hallo! Ich freue mich auf unsere Diskussion.",
        "Hi! Womit sollen wir anfangen?",
        "Schön, euch alle kennenzulernen!"
      ],
      question: [
        "Das ist eine großartige Frage. Lass uns darüber nachdenken.",
        "Guter Punkt! Das denke ich...",
        "Ich würde das gerne klären.",
        "Lassen Sie mich das Schritt für Schritt erklären.",
        "Danke für die Frage - hier ist meine Perspektive..."
      ],
      general: [
        "Ich stimme diesem Ansatz zu.",
        "Könnten Sie diesen Punkt näher erläutern?",
        "Das macht Sinn. Was ist der nächste Schritt?",
        "Verstehe. Wie gehen wir vor?",
        "Danke fürs Teilen dieser Einsicht."
      ]
    },
    'Kazakh': {
      greeting: [
        "Барлығыңызға сәлем! Мұнда болудан қуаныштымын.",
        "Сәлеметсіз бе! Талқылауымызға асығып тұрмын.",
        "Сәлем! Нені бастаймыз?",
        "Барлықтарыңызбен танысуыма қуаныштымын!"
      ],
      question: [
        "Бұл тамаша сұрақ. Ойланайық.",
        "Жақсы ойлау! Менің ойымша...",
        "Мен мұны түсіндіруге қуаныштымын.",
        "Мен мұны қадамма-қадам түсіндірейін.",
        "Сұрағаныңыз үшін рахмет - менің көзқарасым..."
      ],
      general: [
        "Мен бұл тәсілмен келісемін.",
        "Осы мәселе туралы көбірек айта аласыз ба?",
        "Бұл логикалық. Келесі қадам не?",
        "Түсінемін. Қалай жалғастырамыз?",
        "Бұл ойды бөліскеніңіз үшін рахмет."
      ]
    },
    'Arabic': {
      greeting: [
        "مرحبا بالجميع! يسعدني أن أكون هنا.",
        "مرحبا! أتطلع إلى مناقشتنا.",
        "مرحبا! من أين نبدأ؟",
        "يسعدني التعرف عليكم جميعاً!"
      ],
      question: [
        "هذا سؤال رائع. دعونا نفكر في ذلك.",
        "نقطة جيدة! هذا ما أعتقده...",
        "يسعدني توضيح ذلك.",
        "دعني أشرح ذلك خطوة بخطوة.",
        "شكراً على السؤال - هذا رأيي..."
      ],
      general: [
        "أوافق على هذا النهج.",
        "هل يمكنك التوضيح أكثر حول هذه النقطة؟",
        "هذا منطقي. ما هي الخطوة التالية؟",
        "أفهم. كيف نتابع؟",
        "شكراً لمشاركة هذه الفكرة."
      ]
    }
  };

  // Default to English if language not found
  const languageFallbacks = fallbacks[language] || fallbacks['English'] || {
    greeting: [
      "Hi everyone! Thanks for having me here.",
      "Hello! I'm looking forward to our discussion.",
      "Hi! What should we start with?",
      "Nice to meet you all!"
    ],
    question: [
      "That's a great question. Let me think about it.",
      "Good point! Here's what I think...",
      "I'd be happy to clarify that.",
      "Let me address that step by step.",
      "Thanks for asking - here's my perspective."
    ],
    general: [
      "I agree with that approach.",
      "Could you elaborate on that point?",
      "That makes sense. What's the next step?",
      "I see what you mean. How should we proceed?",
      "Thanks for sharing that insight."
    ]
  };
  
  if (userMessageCount === 0) {
    return languageFallbacks.greeting;
  }

  const lastMessage = recentMessages[recentMessages.length - 1];
  const wasQuestion = lastMessage.content.includes("?");
  const wasFromOther = lastMessage.senderId !== userId;

  if (wasQuestion && wasFromOther) {
    return languageFallbacks.question;
  }

  // Check for agreement/disagreement patterns
  const lastContent = lastMessage.content.toLowerCase();
  if (lastContent.includes("agree") || lastContent.includes("think") || 
      lastContent.includes("розийман") || lastContent.includes("думаю") ||
      lastContent.includes("katılıyorum") || lastContent.includes("düşünüyorum")) {
    return languageFallbacks.general;
  }

  return languageFallbacks.general;
}

// ✅ Simplified AI prompt with language support
async function getAISuggestions(
  conversation: string,
  userName: string,
  userMessageCount: number,
  language: string = 'English',
  retryCount = 0
): Promise<string[]> {
  // ✅ Check quota first
  if (quotaExhausted && Date.now() < quotaResetTime) {
    throw new Error("QUOTA_EXHAUSTED");
  }

  // ✅ Language instruction
  const languageInstruction = language !== 'English' 
    ? `\n\nCRITICAL: Respond ONLY in ${language}, not English. All suggestions must be in ${language}.`
    : '';

  // ✅ Shorter, more efficient prompt with language support
  const prompt = `Recent chat:
${conversation}

User: ${userName || "User"} (${userMessageCount} messages sent)${languageInstruction}

Suggest 4 brief, helpful responses (1-2 sentences each) in ${language}.
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
      return getAISuggestions(conversation, userName, userMessageCount, language, retryCount + 1);
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
      console.log(`✅ Returning cached suggestions for ${cacheKey} (${cached.language})`);
      return NextResponse.json({
        suggestions: cached.suggestions,
        detectedLanguage: cached.language,
        cached: true,
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
        language: 'English'
      });

      return NextResponse.json({ 
        suggestions: initialSuggestions,
        detectedLanguage: 'English'
      });
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

    // ✅ DETECT LANGUAGE from conversation
    const detectedLanguage = detectLanguage(conversation);
    console.log(`🌍 Detected language: ${detectedLanguage}`);

    const userMessageCount = recentMessages.filter(
      (m: any) => {
        const senderId = m.senderId instanceof ObjectId ? m.senderId.toString() : String(m.senderId);
        return senderId === userId || m.senderId === userId;
      }
    ).length;

    // ✅ Check if quota is exhausted
    if (quotaExhausted && Date.now() < quotaResetTime) {
      const fallbackSuggestions = generateFallbackSuggestions(
        recentMessages,
        userId,
        userMap,
        detectedLanguage
      );

      const minutesLeft = Math.ceil((quotaResetTime - Date.now()) / 60000);
      
      // ✅ Cache fallback with language
      requestCache.set(cacheKey, {
        timestamp: Date.now() - (CACHE_DURATION - 30000),
        suggestions: fallbackSuggestions,
        language: detectedLanguage
      });
      
      return NextResponse.json({
        suggestions: fallbackSuggestions,
        detectedLanguage,
        warning: `AI quota exhausted. Resets in ${minutesLeft} min. Using contextual suggestions.`,
        quotaExhausted: true,
      });
    }

    try {
      const suggestions = await getAISuggestions(
        conversation,
        userName,
        userMessageCount,
        detectedLanguage
      );

      // ✅ Cache with language
      requestCache.set(cacheKey, {
        timestamp: Date.now(),
        suggestions,
        language: detectedLanguage
      });

      // ✅ More aggressive cache cleanup
      if (requestCache.size > 50) { // Reduced from 100
        const entries = Array.from(requestCache.entries());
        const toDelete = entries
          .sort((a, b) => a[1].timestamp - b[1].timestamp)
          .slice(0, 10); // Delete oldest 10
        
        toDelete.forEach(([key]) => requestCache.delete(key));
      }

      return NextResponse.json({ 
        suggestions,
        detectedLanguage
      });
    } catch (error: any) {
      console.error("❌ AI suggestion error:", error);

      const fallbackSuggestions = generateFallbackSuggestions(
        recentMessages,
        userId,
        userMap,
        detectedLanguage
      );

      // ✅ Cache fallback with language
      requestCache.set(cacheKey, {
        timestamp: Date.now() - (CACHE_DURATION - 30000), // Cache for 30s only
        suggestions: fallbackSuggestions,
        language: detectedLanguage
      });

      if (error.message === "QUOTA_EXHAUSTED") {
        return NextResponse.json({
          suggestions: fallbackSuggestions,
          detectedLanguage,
          warning: "API quota exceeded. Using contextual suggestions.",
          quotaExhausted: true,
        });
      }

      return NextResponse.json({
        suggestions: fallbackSuggestions,
        detectedLanguage,
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
        ],
        detectedLanguage: 'English'
      },
      { status: 500 }
    );
  } finally {
    if (slotAcquired) {
      releaseSlot();
    }
  }
}