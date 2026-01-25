// app/api/videocall/transcript/route.ts
import { NextRequest, NextResponse } from "next/server";
import clientPromise from "@/lib/mongodb";
import { ObjectId } from "mongodb";

// Save transcript entry (chat message or speech-to-text during video call)
export async function POST(req: NextRequest) {
  try {
    const { roomId, senderId, content, type = "chat", timestamp } = await req.json();

    if (!roomId || !senderId || !content) {
      return NextResponse.json(
        { error: "roomId, senderId, and content are required" },
        { status: 400 }
      );
    }

    const client = await clientPromise;
    const db = client.db();
    const transcriptsCollection = db.collection("videocall_transcripts");

    const transcript = {
      roomId,
      senderId,
      content,
      type, // 'chat', 'speech', 'note', 'action_item'
      createdAt: timestamp ? new Date(timestamp) : new Date(),
    };

    const result = await transcriptsCollection.insertOne(transcript);

    return NextResponse.json({
      success: true,
      transcriptId: result.insertedId,
      transcript,
    });
  } catch (err: any) {
    console.error("❌ Video call transcript error:", err);
    return NextResponse.json(
      { error: `Failed to save transcript: ${err.message}` },
      { status: 500 }
    );
  }
}

// Get all transcripts for a room
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
    const transcriptsCollection = db.collection("videocall_transcripts");
    const usersCollection = db.collection("users");

    let query: any = { roomId };
    
    // Optional time filtering
    if (startTime && endTime) {
      query.createdAt = {
        $gte: new Date(parseInt(startTime)),
        $lte: new Date(parseInt(endTime))
      };
    }

    let transcripts = await transcriptsCollection
      .find(query)
      .sort({ createdAt: 1 })
      .toArray();

    // Try ObjectId if no results
    if (transcripts.length === 0 && ObjectId.isValid(roomId)) {
      query.roomId = new ObjectId(roomId);
      transcripts = await transcriptsCollection
        .find(query)
        .sort({ createdAt: 1 })
        .toArray();
    }

    // Enrich with user data
    const senderIds = [...new Set(transcripts.map((t: any) => t.senderId))];
    const users = await usersCollection
      .find({ _id: { $in: senderIds.map((id: any) => new ObjectId(id)) } })
      .project({ _id: 1, name: 1, avatar: 1 })
      .toArray();

    const userMap = new Map(
      users.map((u: any) => [u._id.toString(), { name: u.name, avatar: u.avatar }])
    );

    const enrichedTranscripts = transcripts.map((t: any) => ({
      ...t,
      _id: t._id.toString(),
      sender: userMap.get(t.senderId) || { name: "Guest", avatar: null },
    }));

    return NextResponse.json({
      success: true,
      transcripts: enrichedTranscripts,
      count: enrichedTranscripts.length,
    });
  } catch (err: any) {
    console.error("❌ Fetch transcripts error:", err);
    return NextResponse.json(
      { error: `Failed to fetch transcripts: ${err.message}` },
      { status: 500 }
    );
  }
}