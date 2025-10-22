import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

async function summarizeWithGemini(text: string) {
  const result = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents: [
      {
        role: "user",
        parts: [
          {
            text: `Summarize the following conversation in the same language as concisely as possible without leaving any important information:\n\n${text}`,
          },
        ],
      },
    ],
  });

  return result.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

export async function POST(req: NextRequest) {
  const { text } = await req.json();
  if (!text?.trim()) {
    return NextResponse.json({ error: "Text is required" }, { status: 400 });
  }

  // Retry Gemini up to 2 times if it fails
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const summary = await summarizeWithGemini(text);
      if (summary) {
        return NextResponse.json({ summary, attempt });
      }
    } catch (err) {
      console.error(`Gemini attempt ${attempt} failed:`, err);
      if (attempt === 2) {
        return NextResponse.json(
          { error: "Summarization failed after retries" },
          { status: 500 }
        );
      }
    }
  }
}
