import { sendMessage } from "@/lib/message.controller";
import { auth } from "@clerk/nextjs/server";

export async function POST(req:Request){
  try {
    const body = await req.json();
    console.log("received body",body);
    const {roomId, text} = body;
    if(!roomId || !text){
      return new Response('Missing fields', {status:400});
    }
const { userId } = await auth();

if (!userId) {
  return new Response("Unauthorized", { status: 401 });
}

const newMessage = await sendMessage({ roomId, senderId: userId, content: text });
    return Response.json(newMessage);
  } catch (error) {
    console.error('Post /api/messages error:', error);
    return new Response('Internal server error', {status:500});
  }
}