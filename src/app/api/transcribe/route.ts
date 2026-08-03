import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Auth gate — only logged-in users can transcribe
  const { userId } = await auth(req);
  if (!userId) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await req.formData();
    const audioFile = formData.get("audio") as File | null;

    if (!audioFile) {
      return NextResponse.json(
        { message: "No audio file provided" },
        { status: 400 }
      );
    }

    // Groq free tier: 25MB max per file
    const MAX_BYTES = 25 * 1024 * 1024;
    if (audioFile.size > MAX_BYTES) {
      return NextResponse.json(
        { message: "Audio file too large. Max 25MB per request." },
        { status: 413 }
      );
    }

    // Forward to Groq Whisper
    const groqForm = new FormData();
    groqForm.append("file", audioFile, "audio.webm");
    groqForm.append("model", "whisper-large-v3-turbo"); // fastest + most accurate on Groq
    groqForm.append("response_format", "json");
    // No language param → Whisper auto-detects
    // This matches your existing multilingual summarize logic

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: groqForm,
      }
    );

    if (!groqRes.ok) {
      const errorData = await groqRes.json().catch(() => ({}));
      console.error("Groq error:", errorData);

      if (groqRes.status === 429) {
        return NextResponse.json(
          {
            message:
              "Transcription service is busy. Please wait a moment and try again.",
          },
          { status: 429 }
        );
      }

      return NextResponse.json(
        { message: "Transcription failed" },
        { status: 500 }
      );
    }

    const result = await groqRes.json();
    return NextResponse.json({ transcript: result.text });
  } catch (err: any) {
    console.error("Transcribe route error:", err);
    return NextResponse.json({ message: err.message }, { status: 500 });
  }
}

// The Next.js app router handles formData automatically, so no custom API body parser config is needed.