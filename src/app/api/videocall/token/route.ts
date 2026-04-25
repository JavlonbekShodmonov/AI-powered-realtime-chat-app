import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { roomName } = await request.json();
  const apiKey = process.env.DAILY_API_KEY;

  try {
    // 1. Tell Daily to create the room (or just get it if it exists)
    // We set a 1-hour expiry so the room deletes itself automatically
    const roomRes = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (roomRes.status === 404) {
      // Room doesn't exist, create it
      await fetch("https://api.daily.co/v1/rooms", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          name: roomName,
          properties: {
            exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour safety
            eject_at_room_exp: true,
            enable_chat: true,
          },
        }),
      });
    }

    // 2. Now generate the token for that specific room
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

    return NextResponse.json(
      { error: "Failed to sync room/token" },
      { status: 500 },
    );
  } catch (error) {
    return NextResponse.json(
      { error: "Daily API connection failed" },
      { status: 500 },
    );
  }
}
