// app/api/videocall/deepgram/route.ts
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const { apiKey } = await req.json();

    if (!apiKey) {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      );
    }

    // Return the Deepgram API key securely
    const deepgramKey = process.env.DEEPGRAM_API_KEY;

    if (!deepgramKey) {
      return NextResponse.json(
        { error: "Deepgram API key not configured on server" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      apiKey: deepgramKey,
    });
  } catch (err: any) {
    console.error("❌ Deepgram key retrieval error:", err);
    return NextResponse.json(
      { error: `Failed to get API key: ${err.message}` },
      { status: 500 }
    );
  }
}

// WebSocket endpoint for streaming audio
export async function GET(req: NextRequest) {
  return NextResponse.json({
    message: "Use POST to get Deepgram credentials",
  });
}