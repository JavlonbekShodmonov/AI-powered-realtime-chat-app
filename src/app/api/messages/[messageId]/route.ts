import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import  clientPromise  from "@/lib/mongodb";
import  { auth }  from "../../../../lib/auth";


export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { text } = body;

  if (!text || typeof text !== "string") {
    return NextResponse.json(
      { error: "invalid message content" },
      { status: 400 }
    );
  }

  const { message, messagesCollection, error, status } = await GET(
    params.id,
    userId
  );

  if (error) {
    return NextResponse.json({ error }, { status });
  }

  await messagesCollection.updateOne(
    { _id: new ObjectId(params.id) },
    { $set: { content: text, editedAt: new Date() } }
  );

  return NextResponse.json({ message: "message updated" });
}

export async function GET(id: string, userId: string) {
  const MongoClient = await clientPromise;
  const db = MongoClient.db();
  const messagesCollection = db.collection("messages");

  const message = await messagesCollection.findOne({ _id: new ObjectId(id) });

  if (!message) {
    return { error: "Message not found", status: 404, messagesCollection };
  }

  if (message.senderId !== userId) {
    return { error: "Forbidden", status: 403, messagesCollection };
  }

  return { message, messagesCollection };
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { message, messagesCollection, error, status } = await GET(
    params.id,
    userId
  );

  if(error){
    return NextResponse.json({error:`${error}`});
  }

if (!ObjectId.isValid(params.id)) {
  return NextResponse.json({ error: "Invalid message ID" }, { status: 400 });
}

  await messagesCollection.deleteOne({_id:new ObjectId(params.id)});

  return NextResponse.json({message:"message deleted"});
    } catch (error) {
    console.error("DELETE /api/messages/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
