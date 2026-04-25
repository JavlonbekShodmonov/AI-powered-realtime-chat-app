import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { roomName } = await request.json();
  const apiKey = process.env.DAILY_API_KEY;

  try {
    // 1. Create the room with properties
    const roomRes = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: roomName,
        properties: {
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
          eject_at_room_exp: true,
          enable_chat: true,
        },
      }),
    });

    if (!roomRes.ok) {
      const error = await roomRes.json();
      console.error("Daily room creation error:", error);
      // Room might already exist, which is fine - continue to token generation
      if (error.error?.type !== "already-exists") {
        return NextResponse.json(
          { error: "Failed to create room" },
          { status: 500 },
        );
      }
    }

    // 2. Generate the token for that specific room
    const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          room_name: roomName,
          is_owner: true,
          exp: Math.floor(Date.now() / 1000) + 1800, // 30 min safety
        },
      }),
    });

    const tokenData = await tokenRes.json();

    if (tokenData.token) {
      return NextResponse.json({ token: tokenData.token });
    }

    console.error("Token generation error:", tokenData);
    return NextResponse.json(
      { error: "Failed to generate token" },
      { status: 500 },
    );
  } catch (error) {
    console.error("Daily API error:", error);
    return NextResponse.json(
      { error: "Daily API connection failed" },
      { status: 500 },
    );
  }
}
