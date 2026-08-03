import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth(req);
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { subscription } = await req.json();
    if (!subscription) {
      return NextResponse.json({ error: "Missing subscription" }, { status: 400 });
    }

    const gatewayUrl = process.env.API_GATEWAY_URL || "http://localhost:3002";
    const response = await fetch(`${gatewayUrl}/api/subscriptions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": process.env.INTERNAL_API_SECRET!,
      },
      body: JSON.stringify({
        subscription,
        userId: String(userId), // always the verified userId, never client-supplied
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("api-gateway subscription error:", error);
      throw new Error("Failed to save subscription");
    }

    return NextResponse.json({ success: true, message: "Subscription saved successfully" });
  } catch (error: any) {
    console.error("Error saving subscription:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}
