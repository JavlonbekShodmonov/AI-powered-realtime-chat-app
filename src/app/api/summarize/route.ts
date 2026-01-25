// app/api/summarize/route.ts
// COMPLETE UPDATED VERSION - Replace your entire file with this

import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });
const CHUNK_SIZE = 1000;

function chunkText(text: string, size: number) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + size));
    start += size;
  }
  return chunks;
}

async function summarizeText(text: string, prompt: string) {
  const chunks = chunkText(text, CHUNK_SIZE);
  let summaries: string[] = [];

  for (const chunk of chunks) {
    try {
      const result = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\n${chunk}` }] }],
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
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\n${combined}` }] }],
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
      // For video calls, userId is already a string in the transcript
      senderIds = [...new Set(allMessages.map((m: any) => m.userId))];
    } else {
      // For regular chat, senderId might be ObjectId
      senderIds = [...new Set(allMessages.map((m: any) => m.senderId))];
    }
    
    console.log("👥 Unique sender IDs:", senderIds);
    
    // Try to get user names from database
    const users = await usersCollection
      .find({ 
        _id: { 
          $in: senderIds.map((id: any) => {
            try {
              return new ObjectId(id);
            } catch {
              return id; // Keep as string if not valid ObjectId
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

    // For video calls, also add userName from transcript if user not in DB
    if (isVideoCall) {
      allMessages.forEach((m: any) => {
        if (m.userId && m.userName && !userMap.has(m.userId)) {
          userMap.set(m.userId, m.userName);
        }
      });
    }

    // Format messages with sender names and timestamps
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

    // Filter out invalid messages
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

    // Prepare prompt based on context
    const contextPrompt = isVideoCall
      ? "video call conversation"
      : "chat conversation";

    const fullChatText = validMessages
      .map((m) => `${m.sender}: ${m.content}`)
      .join("\n");

    console.log("📝 Full chat text length:", fullChatText.length);
    console.log("📝 First 200 chars:", fullChatText.substring(0, 200));

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
      console.log(`📝 User text length:`, userText?.length || 0);
    }
 
    try {
      console.log("🤖 Starting AI summarization...");
      
      const fullPrompt = isVideoCall
        ? `Summarize this video call conversation concisely. Include:
           1. Main topics discussed
           2. Key decisions or action items
           3. Important questions raised
           4. Overall tone and participation level
           Keep it clear and actionable.`
        : `Summarize this chat conversation as concisely as possible without losing important information. Include the main topics discussed and key points.`;

      const userPrompt = isVideoCall
        ? `Summarize ${userName}'s contributions in this video call. Focus on:
           1. Their main talking points
           2. Questions they asked
           3. Decisions or suggestions they made
           4. Their level of participation`
        : `Summarize all messages from ${userName} as concisely as possible. Focus on their main contributions, questions, and key points.`;

      // Run summaries in parallel if userText exists
      const [fullSummary, userSummary] = await Promise.all([
        userId
          ? Promise.resolve(null)
          : summarizeText(fullChatText, fullPrompt),
        userText
          ? summarizeText(userText, userPrompt)
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