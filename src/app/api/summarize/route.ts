import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });
const CHUNK_SIZE = 1000; // Adjust as needed

// Utility: split text into chunks
function chunkText(text: string, size: number) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size;
  }
  return chunks;
}

// Summarize text using Gemini, with chunking and retry logic
async function summarizeText(text: string, prompt: string) {
  const chunks = chunkText(text, CHUNK_SIZE);
  let summaries: string[] = [];

  for (const chunk of chunks) {
    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash", // ✅ Using gemini-2.5-flash
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\n${chunk}` }] }],
      });
      const summary = result.candidates?.[0]?.content?.parts?.[0]?.text;
      if (summary) summaries.push(summary);
    } catch (error: any) {
      console.error("❌ Chunk summarization error:", error);
      
      // If quota exceeded, return a simple concatenation instead
      if (error.message?.includes("quota") || error.message?.includes("RESOURCE_EXHAUSTED")) {
        console.warn("⚠️ Quota exceeded, returning basic summary");
        return `Summary unavailable due to API quota limits. Here are the raw messages:\n\n${text.substring(0, 500)}...`;
      }
      throw error;
    }
  }

  // If multiple chunks, summarize the combined summaries
  if (summaries.length > 1) {
    try {
      const combined = summaries.join("\n");
      const finalResult = await ai.models.generateContent({
        model: "gemini-2.5-flash", // ✅ Using gemini-2.5-flash
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\n${combined}` }] }],
      });
      return finalResult.candidates?.[0]?.content?.parts?.[0]?.text || null;
    } catch (error: any) {
      console.error("❌ Final summarization error:", error);
      // Return the individual summaries if final combination fails
      return summaries.join("\n\n");
    }
  }

  return summaries[0] || null;
}

export async function POST(req: NextRequest) {
  try {
    const { roomId, userId } = await req.json();

    console.log("📥 Summarize request:", { roomId, userId, roomIdType: typeof roomId });

    if (!roomId) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const messagesCollection = db.collection("messages");
    const usersCollection = db.collection("users");

    // ✅ Fetch all messages in the room - try both string and ObjectId
    let allMessages = await messagesCollection
      .find({ roomId })
      .sort({ createdAt: 1 })
      .toArray();

    console.log(`📊 Found ${allMessages.length} messages with string query`);

    // If no results with string, try ObjectId
    if (allMessages.length === 0 && ObjectId.isValid(roomId)) {
      console.log("🔍 Trying ObjectId query...");
      allMessages = await messagesCollection
        .find({ roomId: new ObjectId(roomId) })
        .sort({ createdAt: 1 })
        .toArray();
      console.log(`📊 Found ${allMessages.length} messages with ObjectId query`);
    }

    if (!allMessages.length) {
      return NextResponse.json({
        fullSummary: null,
        userSummary: null,
        message: "No messages yet",
      });
    }

    // ✅ Get user names for better context
    const senderIds = [...new Set(allMessages.map((m: any) => m.senderId))];
    console.log("👥 Unique sender IDs:", senderIds);
    
    const users = await usersCollection
      .find({ _id: { $in: senderIds.map((id: any) => new ObjectId(id)) } })
      .project({ _id: 1, name: 1 })
      .toArray();

    console.log("👥 Found users:", users.length);

    const userMap = new Map(
      users.map((u: any) => [u._id.toString(), u.name || "Guest"])
    );

    // ✅ Format messages with sender names
    const formattedMessages = allMessages.map((m: any) => ({
      sender: userMap.get(m.senderId) || "Guest",
      content: m.content,
    }));

    // Prepare texts
    const fullChatText = formattedMessages
      .map((m) => `${m.sender}: ${m.content}`)
      .join("\n");

    console.log("📝 Full chat text length:", fullChatText.length);

    // ✅ Filter by userId if provided
    let userText = null;
    let userName = "User";
    
    if (userId) {
      const userMessages = formattedMessages.filter(
        (m, idx) => allMessages[idx].senderId === userId
      );
      
      userName = userMap.get(userId) || "User";
      userText = userMessages
        .map((m) => `${m.sender}: ${m.content}`)
        .join("\n");

      console.log(`📝 User ${userName} messages count:`, userMessages.length);
      console.log(`📝 User text length:`, userText?.length || 0);
    }
 
    try {
      console.log("🤖 Starting AI summarization...");
      
      // Run summaries in parallel if userText exists
      const [fullSummary, userSummary] = await Promise.all([
        userId
          ? Promise.resolve(null)
          : summarizeText(
              fullChatText,
              "Summarize this full chat conversation as concisely as possible without losing important information. Include the main topics discussed and key points."
            ),
        userText
          ? summarizeText(
              userText,
              `Summarize all messages from ${userName} as concisely as possible. Focus on their main contributions, questions, and key points.`
            )
          : Promise.resolve(null),
      ]);

      console.log("✅ Summaries generated successfully");

      return NextResponse.json({
        fullSummary,
        userSummary,
        message: "Summary generated successfully",
      });
    } catch (err: any) {
      console.error("❌ Summarization AI error:", err);
      
      // ✅ Handle quota errors gracefully
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
        fullSummary: null, 
        userSummary: null 
      },
      { status: 500 }
    );
  }
}