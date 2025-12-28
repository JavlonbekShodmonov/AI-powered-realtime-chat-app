import  clientPromise  from "../lib/mongodb";
import { ObjectId } from "mongodb";

// Get users by IDs from your MongoDB "users" collection
async function getUsersByIds(userIds:any) {
  const client = await clientPromise;
  const db = client.db();
  const users = await db
    .collection("users")
    .find({ _id: { $in: userIds.map((id:any) => new ObjectId(id)) } })
    .project({ name: 1, email: 1, image: 1 })
    .toArray();

  return Object.fromEntries(users.map((u) => [u._id.toString(), u]));
}

export const getMessages = async ({ roomId, page = 1, limit = 20 }: { roomId: string; page?: number; limit?: number }) => {
  const client = await clientPromise;
  const db = client.db();
  const messagesCollection = db.collection("messages");

  const skip = (page - 1) * limit;
  const messages = await messagesCollection
    .find({ roomId })
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const senderIds = [...new Set(messages.map((m) => m.senderId))];
  const userMap = await getUsersByIds(senderIds);

  return messages.map((msg) => ({
    ...msg,
    _id: msg._id.toString(),
    sender: userMap[msg.senderId] || null,
  }));
};

export async function sendMessage({ roomId, senderId, content }: { roomId: string; senderId: string; content: string }) {
  const client = await clientPromise;
  const db = client.db();

  const newMessage = {
    roomId,
    senderId,
    content,
    createdAt: new Date(),
  };

  const { insertedId } = await db.collection("messages").insertOne(newMessage);
  const insertedMessage = await db.collection("messages").findOne({ _id: insertedId });
  if (!insertedMessage) throw new Error("Failed to retrieve inserted message");
  return { ...insertedMessage, _id: insertedMessage._id.toString() };
}

export async function updateMessage({ messageId, senderId, text }:{messageId:string, senderId:string, text:string}) {
  const client = await clientPromise;
  const db = client.db();

  const result = await db.collection("messages").findOneAndUpdate(
    { _id: new ObjectId(messageId), senderId },
    { $set: { content: text, editedAt: new Date() } },
    { returnDocument: "after" }
  );

  if (!result || !result.value) throw new Error("Message not found or unauthorized");
  return { ...result.value, _id: result.value._id.toString() };
}

export async function deleteMessage({ messageId, senderId }:{messageId:string, senderId:string}) {
  const client = await clientPromise;
  const db = client.db();

  const result = await db.collection("messages").deleteOne({
    _id: new ObjectId(messageId),
    senderId,
  });

  if (result.deletedCount === 0) throw new Error("Message not found or unauthorized");
  return { success: true };
}
