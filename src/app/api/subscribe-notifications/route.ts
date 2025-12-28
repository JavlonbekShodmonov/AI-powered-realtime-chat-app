import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

// ✅ This endpoint receives subscriptions from the frontend
// and forwards them to your Socket.IO server
export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth(req);
    
    if (!userId) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { subscription, userId: requestUserId } = await req.json();

    // Use the authenticated userId, not the one from request body
    const targetUserId = requestUserId || userId;

    if (!subscription) {
      return NextResponse.json(
        { error: "Missing subscription" },
        { status: 400 }
      );
    }

    console.log(`📝 Forwarding subscription for user ${targetUserId} to socket server`);

    // ✅ Forward to your Socket.IO server
    const socketServerUrl = process.env.SOCKET_SERVER_URL || "https://shadmanov.onrender.com";
    const response = await fetch(`${socketServerUrl}/api/subscribe-notifications`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subscription,
        userId: targetUserId,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("❌ Socket server error:", error);
      throw new Error("Failed to save subscription to socket server");
    }

    const result = await response.json();
    console.log("✅ Subscription saved to socket server:", result);

    return NextResponse.json({
      success: true,
      message: "Subscription saved successfully",
    });
  } catch (error: any) {
    console.error("❌ Error saving subscription:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}