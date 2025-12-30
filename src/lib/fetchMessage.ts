import { ObjectId } from "mongodb";
import clientPromise from "./mongodb";


export async function fetchMessage(messageId: string, userId: string) {
  const MongoClient = await clientPromise;
  const db = MongoClient.db();
  const messagesCollection = db.collection("messages");

  const message = await messagesCollection.findOne({ _id: new ObjectId(messageId) });

  if (!message) {
    return { error: "Message not found", status: 404, messagesCollection };
  }

  if (message.senderId !== userId) {
    return { error: "Forbidden", status: 403, messagesCollection };
  }

  return { message, messagesCollection };
}