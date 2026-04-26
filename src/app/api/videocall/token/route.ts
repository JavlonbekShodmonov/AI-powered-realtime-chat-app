import { NextResponse } from "next/server";

function sanitizeRoomName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .substring(0, 100);
}

export async function POST(request: Request) {
  const { roomName } = await request.json();
  const apiKey = process.env.DAILY_API_KEY;

  console.log("🎥 Token request received for room:", roomName);

  if (!roomName || typeof roomName !== "string") {
    console.error("❌ Invalid room name:", roomName);
    return NextResponse.json({ error: "Invalid room name" }, { status: 400 });
  }

  if (!apiKey) {
    console.error("❌ DAILY_API_KEY is not set");
    return NextResponse.json(
      { error: "Server configuration error: missing API key" },
      { status: 500 },
    );
  }

  const sanitizedRoomName = sanitizeRoomName(roomName);
  console.log("📝 Sanitized room name:", sanitizedRoomName);

  try {
    // 1. Try to create the room
    console.log("🌐 Creating/getting room on Daily API...");

    const roomRes = await fetch("https://api.daily.co/v1/rooms", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: sanitizedRoomName,
        properties: {
          exp: Math.floor(Date.now() / 1000) + 3600,
          eject_at_room_exp: true,
          enable_chat: true,
        },
      }),
    });

    const roomData = await roomRes.json();
    console.log("🌐 Room API status:", roomRes.status);
    console.log("🌐 Room API response:", JSON.stringify(roomData));

    if (roomRes.ok) {
      console.log("✅ Room created:", sanitizedRoomName);
    } else if (
      (roomData.info || roomData.error || "").toLowerCase().includes("already")
    ) {
      // Room exists — refresh its expiry so it never hangs on an expired room
      console.log("🔄 Room exists, refreshing expiry...");

      const updateRes = await fetch(
        `https://api.daily.co/v1/rooms/${sanitizedRoomName}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            properties: {
              exp: Math.floor(Date.now() / 1000) + 3600,
              eject_at_room_exp: true,
            },
          }),
        },
      );

      if (updateRes.ok) {
        console.log("✅ Room expiry refreshed");
      } else {
        const updateErr = await updateRes.json();
        console.error("❌ Failed to refresh room expiry:", updateErr);
        throw new Error(
          `Failed to refresh room: ${updateErr.error || "unknown"}`,
        );
      }
    } else {
      throw new Error(`Daily API error: ${roomData.error || "Unknown error"}`);
    }

    // 2. Generate the token
    console.log("🔐 Generating meeting token...");

    const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        properties: {
          room_name: sanitizedRoomName,
          is_owner: true,
          exp: Math.floor(Date.now() / 1000) + 3600,
        },
      }),
    });

    const tokenData = await tokenRes.json();
    console.log("🔐 Token API status:", tokenRes.status);
    console.log("🔐 Token API response:", JSON.stringify(tokenData));

    if (!tokenRes.ok) {
      console.error("❌ Token generation failed:", JSON.stringify(tokenData));
      throw new Error(
        `Token generation failed: ${tokenData.error || "Unknown error"}`,
      );
    }

    if (!tokenData.token || typeof tokenData.token !== "string") {
      console.error("❌ Invalid token in response:", JSON.stringify(tokenData));
      throw new Error("Daily API returned invalid token");
    }

    console.log(
      "✅ Token generated successfully, length:",
      tokenData.token.length,
    );
    return NextResponse.json({ token: tokenData.token });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("❌ Error:", errorMsg);
    return NextResponse.json(
      { error: errorMsg || "Failed to generate token" },
      { status: 500 },
    );
  }
}