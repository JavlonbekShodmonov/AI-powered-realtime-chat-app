import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";

export interface Message {
  _id: string;
  roomId: string;
  senderId: string;
  sender?: {
    _id: string;
    name: string;
  };
  content: string;
  createdAt: Date;
}

export async function getMessagesForRoom(
  roomId: string,
  cursor?: string,
  limit: number = 20
): Promise<Message[]> {
  const client = await clientPromise;
  const dbName = process.env.MONGODB_DB;
  const db = client.db(dbName);

  const query: any = { roomId };

  if (cursor) {
    query._id = { $lt: new ObjectId(cursor) }; // fetch older messages
  }

  const messages = await db
    .collection("messages")
    .find(query)
    .sort({ _id: -1 }) // newest first
    .limit(limit)
    .toArray();

  // ✅ Get all unique sender IDs
  const senderIds = [...new Set(messages.map((m: any) => m.senderId))];

  // ✅ Fetch user names for all senders
  const users = await db
    .collection("users")
    .find({ _id: { $in: senderIds.map((id: any) => new ObjectId(id)) } })
    .project({ _id: 1, name: 1 })
    .toArray();

  // ✅ Create a map of userId -> userName
  const userMap = new Map(
    users.map((u: any) => [u._id.toString(), u.name || "Guest"])
  );

  // Reverse so oldest appear first and add sender info
  return messages.reverse().map((m: any) => ({
    _id: m._id.toString(),
    roomId: m.roomId,
    senderId: m.senderId,
    sender: {
      _id: m.senderId,
      name: userMap.get(m.senderId) || "Guest",
    },
    content: m.content,
    createdAt: m.createdAt,
  }));
}