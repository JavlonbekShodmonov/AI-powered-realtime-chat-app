import { NextRequest, NextResponse } from "next/server";
import { GoogleGenAI } from "@google/genai";


const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_KEY });

export async function POST(req: NextRequest) {
  const { text } = await req.json();

  try {
    const result = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [
        {
          role: "user",
          parts: [{ text: `Summarize the following conversation in the same language as concisely as possible without leaving any important information:\n\n${text}` }],
        },
      ],
    });

    const summary = result.candidates?.[0]?.content?.parts?.[0]?.text || null;

    return NextResponse.json({ summary });
  } catch (err) {
    console.error("Gemini SDK summarization error:", err);
    return NextResponse.json(
      { error: "Summarization failed" },
      { status: 500 }
    );
  }
}
