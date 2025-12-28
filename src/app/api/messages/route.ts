import { sendMessage } from "@/lib/message.controller";
import { jwtVerify } from "jose";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { roomId, text } = body;

    if (!roomId || !text) {
      return new Response("Missing fields", { status: 400 });
    }

    const token = req.headers.get("authorization")?.split(" ")[1];
    if (!token) return new Response("Unauthorized", { status: 401 });

    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    const userId = payload.userId;

    const newMessage = await sendMessage({
      roomId,
      senderId: userId,
      content: text,
    });

    // 🔔 Notify sockets
    global.io?.to(roomId).emit("newMessage", newMessage);

    return Response.json(newMessage);
  } catch (error) {
    console.error("POST /api/messages error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
