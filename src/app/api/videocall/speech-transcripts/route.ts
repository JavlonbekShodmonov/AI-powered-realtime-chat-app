// app/api/videocall/speech-transcripts/route.ts
import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

// Save speech transcript (from Web Speech API)
export async function POST(req: NextRequest) {
  try {
    const { roomId, userId, userName, text, timestamp } = await req.json();

    if (!roomId || !userId || !text) {
      return NextResponse.json(
        { error: "roomId, userId, and text are required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();
    const transcriptsCollection = db.collection("videocall_speech_transcripts");

    const transcript = {
      roomId,
      userId,
      userName: userName || "Guest",
      text: text.trim(),
      timestamp: timestamp || Date.now(),
      createdAt: new Date(),
    };

    const result = await transcriptsCollection.insertOne(transcript);

    return NextResponse.json({
      success: true,
      transcript: {
        _id: result.insertedId.toString(),
        ...transcript,
      },
    });
  } catch (err: any) {
    console.error("❌ Save speech transcript error:", err);
    return NextResponse.json(
      { error: `Failed to save transcript: ${err.message}` },
      { status: 500 }
    );
  }
}

// Get all speech transcripts for a room
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get("roomId");
    const startTime = searchParams.get("startTime");
    const endTime = searchParams.get("endTime");

    if (!roomId) {
      return NextResponse.json({ error: "roomId is required" }, { status: 400 });
    }

    const client = await clientPromise;
    const db = client.db();
    const transcriptsCollection = db.collection("videocall_speech_transcripts");

    let query: any = { roomId };
    
    // Optional time filtering
    if (startTime) {
      const start = parseInt(startTime);
      query.timestamp = { $gte: start };
      
      if (endTime) {
        query.timestamp.$lte = parseInt(endTime);
      }
    }

    let transcripts = await transcriptsCollection
      .find(query)
      .sort({ timestamp: 1 })
      .toArray();

    // Try ObjectId if no results
    if (transcripts.length === 0 && ObjectId.isValid(roomId)) {
      query.roomId = new ObjectId(roomId);
      transcripts = await transcriptsCollection
        .find(query)
        .sort({ timestamp: 1 })
        .toArray();
    }

    const formattedTranscripts = transcripts.map((t: any) => ({
      _id: t._id.toString(),
      roomId: t.roomId,
      userId: t.userId,
      userName: t.userName,
      text: t.text,
      timestamp: t.timestamp,
    }));

    return NextResponse.json({
      success: true,
      transcripts: formattedTranscripts,
      count: formattedTranscripts.length,
    });
  } catch (err: any) {
    console.error("❌ Fetch speech transcripts error:", err);
    return NextResponse.json(
      { error: `Failed to fetch transcripts: ${err.message}` },
      { status: 500 }
    );
  }
}