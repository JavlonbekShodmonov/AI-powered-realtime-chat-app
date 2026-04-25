import { NextResponse } from "next/server";

// Sanitize room name to be Daily-API compatible
function sanitizeRoomName(name: string): string {
  // Replace invalid characters with hyphens, lowercase, and limit length
  return name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-") // Replace multiple hyphens with single
    .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
    .substring(0, 100); // Daily has a 100 char limit
}

export async function POST(request: Request) {
  const { roomName } = await request.json();
  const apiKey = process.env.DAILY_API_KEY;

  console.log("🎥 Token request received for room:", roomName);

  // Validate inputs
  if (!roomName || typeof roomName !== "string") {
    console.error("❌ Invalid room name:", roomName);
    return NextResponse.json(
      { error: "Invalid room name" },
      { status: 400 },
    );
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
    // 1. Try to create or get the room
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
          exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
          eject_at_room_exp: true,
          enable_chat: true,
        },
      }),
    });

    const roomData = await roomRes.json();
    
    console.log("🌐 Room API status:", roomRes.status);
    
    if (!roomRes.ok) {
      console.error("⚠️ Room creation response:", JSON.stringify(roomData));
      
      // Check if room already exists (different API versions have different error formats)
      const errorMsg = (roomData.error || "").toLowerCase();
      const isAlreadyExists = 
        errorMsg.includes("already") || 
        errorMsg.includes("exists") ||
        roomData.error === "already-exists";
      
      if (!isAlreadyExists && roomRes.status !== 403 && roomRes.status !== 409) {
        console.error("❌ Cannot create room. Status:", roomRes.status);
        throw new Error(`Daily API error: ${roomData.error || "Unknown error"}`);
      }
      console.log("✓ Room already exists or is in use, continuing...");
    } else {
      console.log("✅ Room created/retrieved:", sanitizedRoomName);
    }

    // 2. Generate the token for that specific room
    console.log("🔐 Generating meeting token...");
    const tokenRes = await fetch("https://api.daily.co/v1/meeting-tokens", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        room_name: sanitizedRoomName,
        is_owner: true,
        exp: Math.floor(Date.now() / 1000) + 1800, // 30 min safety
      }),
    });

    const tokenData = await tokenRes.json();
    
    console.log("🔐 Token API status:", tokenRes.status);

    if (!tokenRes.ok) {
      console.error("❌ Token generation failed:", JSON.stringify(tokenData));
      throw new Error(`Token generation failed: ${tokenData.error || "Unknown error"}`);
    }

    if (!tokenData.token) {
      console.error("❌ No token in response:", JSON.stringify(tokenData));
      throw new Error("Daily API returned empty token");
    }

    if (typeof tokenData.token !== "string") {
      console.error("❌ Token is not a string:", typeof tokenData.token);
      throw new Error("Daily API returned invalid token format");
    }

    console.log("✅ Token generated successfully, length:", tokenData.token.length);
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
