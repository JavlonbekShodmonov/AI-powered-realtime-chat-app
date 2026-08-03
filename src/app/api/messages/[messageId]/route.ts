import { ObjectId } from "mongodb";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "../../../../lib/auth";
import { fetchMessage } from "../../../../lib/fetchMessage";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  // Was calling Clerk's no-argument auth() — dead code now that Clerk is
  // gone. Switched to the same auth(req) wrapper the rest of the app uses.
  const { userId } = await auth(req);
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

  const { messagesCollection, error, status } = await fetchMessage(
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

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { userId } = await auth(req);
    if (!userId) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    if (!ObjectId.isValid(params.id)) {
      return NextResponse.json({ error: "Invalid message ID" }, { status: 400 });
    }

    const { messagesCollection, error } = await fetchMessage(params.id, userId);

    if (error) {
      return NextResponse.json({ error: `${error}` });
    }

    await messagesCollection.deleteOne({ _id: new ObjectId(params.id) });

    return NextResponse.json({ message: "message deleted" });
  } catch (error) {
    console.error("DELETE /api/messages/[id] error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
