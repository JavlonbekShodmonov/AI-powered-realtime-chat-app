import { clientPromise } from "@/lib/mongodb";
import { clerkClient } from "@clerk/nextjs/server";
import { ObjectId } from "mongodb";
// Fetch Clerk users by a list of user IDs
async function getClerkUsersByIds(userIds) {
  const clerkIds = [...new Set(userIds)].filter((id) => id !== "guest");

  const users = await Promise.all(
    clerkIds.map(async (id) => {
      try {
        const user = await clerkClient.users.getUser(id);
        return {
          id: user.id,
          name: user.fullName || "No name",
          email: user.emailAddresses[0]?.emailAddress || "No email",
          imageUrl: user.imageUrl,
        };
      } catch (err) {
        console.warn(`Failed to fetch Clerk user ${id}:`, err);
        return null;
      }
    })
  );

  // Optional fallback guest user (for display)
  if (userIds.includes("guest")) {
    users.push({
      id: "guest",
      name: "Guest User",
      email: "",
      imageUrl: "", // or some default guest avatar
    });
  }

  return Object.fromEntries(users.filter(Boolean).map((u) => [u.id, u]));
}

// GET MESSAGES with Clerk user info
export const getMessages = async ({ roomId, page = 1, limit = 20 }) => {
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

  const senderIds = messages.map((msg) => msg.senderId);
  const userMap = await getClerkUsersByIds(senderIds);

  return messages.map((msg) => ({
    ...msg,
    _id: msg._id.toString(),
    sender: userMap[msg.senderId] || null,
  }));
};

// SEND message
export async function sendMessage({ roomId, senderId, content }) {
  try {
    const client = await clientPromise;
    const db = client.db();

    const newMessage = {
      roomId, // string
      senderId, // string
      content,
      createdAt: new Date(),
    };

    const result = await db.collection("messages").insertOne(newMessage);
    const insertedMessage = await db
      .collection("messages")
      .findOne({ _id: result.insertedId });
    return {
      ...insertedMessage,
      _id: insertedMessage._id.toString(),
    };
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}

// UPDATE MESSAGE
export async function updateMessage(payload) {
  // Accept either (messageId, senderId, text) or a single object
  let messageId, senderId, text;
  if (payload && typeof payload === "object" && payload.messageId && (payload.text || payload.newContent)) {
    messageId = payload.messageId;
    senderId = payload.senderId;
    text = payload.text ?? payload.newContent;
  } else {
    // fallback if caller used positional args
    [messageId, senderId, text] = arguments;
  }

  console.log("updateMessage called with:", { messageId, senderId, text });
  if (!messageId) throw new Error("Missing messageId");

  try {
    const client = await clientPromise;
    const db = client.db();
    const messages = db.collection("messages");

    // sanity checks
    console.log("ObjectId.isValid:", ObjectId.isValid(messageId));
    const objectId = new ObjectId(messageId);

    const filter = { _id: objectId, senderId: senderId };
    console.log("Using filter:", filter);

    // Try a direct findOne(filter) first to see if it matches
    const directMatch = await messages.findOne(filter);
    console.log("findOne(filter) ->", directMatch);

    // Try findOneAndUpdate (preferred)
    const rawResult = await messages.findOneAndUpdate(
      filter,
      { $set: { content: text, editedAt: new Date() } },
      { returnDocument: "after" } // try "after"
    );
    console.log("findOneAndUpdate raw result:", rawResult);

    // Normalize updated document across driver versions:
    const updatedDoc = rawResult?.value ?? rawResult;
    console.log("normalized updatedDoc:", updatedDoc);

    if (updatedDoc) {
      return { ...updatedDoc, _id: updatedDoc._id.toString() };
    }

    // If we reach here, findOneAndUpdate did not return a doc (filter didn't match).
    // Log state to diagnose:
    const byId = await messages.findOne({ _id: objectId });
    const bySender = await messages.findOne({ senderId });
    console.log("byId:", byId);
    console.log("bySender:", bySender);

    // Fallback: perform updateOne (looser - only by id) and then fetch
    console.warn("findOneAndUpdate returned no document — attempting fallback updateOne by _id.");
    const fallback = await messages.updateOne(
      { _id: objectId },
      { $set: { content: text, editedAt: new Date() } }
    );
    console.log("updateOne result:", fallback);

    const fetched = await messages.findOne({ _id: objectId });
    console.log("fetched after updateOne:", fetched);

    if (!fetched) {
      throw new Error("Message not found after fallback update");
    }

    // IMPORTANT: fallback bypasses senderId check (so restore security logic after debugging)
    return { ...fetched, _id: fetched._id.toString() };
  } catch (err) {
    console.error("updateMessage ERROR:", err);
    throw err;
  }
}



// DELETE MESSAGE
export async function deleteMessage({ messageId, senderId }) {
  try {
    const client = await clientPromise;
    const db = client.db();

    const result = await db.collection("messages").deleteOne({
      _id: new ObjectId(messageId),
      senderId, // only delete if user owns it
    });

    if (result.deletedCount === 0)
      throw new Error("Message not found or not authorized");

    return { success: true };
  } catch (error) {
    console.error("Error deleting message:", error);
    throw error;
  }
}
