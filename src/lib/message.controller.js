import {clientPromise} from '@/lib/mongodb';
import { clerkClient } from '@clerk/nextjs/server';
import { ObjectId } from 'mongodb';

// Fetch Clerk users by a list of user IDs
async function getClerkUsersByIds(userIds) {
  const clerkIds = [...new Set(userIds)].filter((id) => id !== "guest");

  const users = await Promise.all(
    clerkIds.map(async (id) => {
      try {
        const user = await clerkClient.users.getUser(id);
        return {
          id: user.id,
          name: user.fullName || 'No name',
          email: user.emailAddresses[0]?.emailAddress || 'No email',
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
export const getMessages = async ({roomId, page = 1, limit = 20 }) => {
  const client = await clientPromise;
  const db = client.db();
  const messagesCollection = db.collection("messages");

  const skip = (page - 1) * limit;

  const messages = await messagesCollection
    .find({ roomId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .toArray();

  const senderIds = messages.map((msg) => msg.senderId);
  const userMap = await getClerkUsersByIds(senderIds);

  return messages.map((msg) => ({
    ...msg,
    sender: userMap[msg.senderId] || null,
  }));
}


// SEND message
export async function sendMessage({ roomId, senderId, content }) {
  try {
    const client = await clientPromise;
    const db = client.db();

    const newMessage = {
      roomId,        // string
      senderId,      // string
      content,
      createdAt: new Date(),
    };

    const result = await db.collection('messages').insertOne(newMessage);
    const insertedMessage = await db.collection('messages').findOne({_id:result.insertedId});
    return{
      ...insertedMessage,
      _id:insertedMessage._id.toString(),
    }
  } catch (error) {
    console.error('Error sending message:', error);
    throw error;
  }
}

export async function updateMessage({ messageId, senderId, newContent }){
  try {
    const client = await clientPromise;
    const db = client.db();

    const result = await db.collection('messages').findOneAndUpdate(
      {_id: new ObjectId(messageId),senderId},
      {
        $set:{
          content:newContent,
          updatedAt:new Date(),
        },
      },
      {returnDocument:'after'}
    );

    if (!result.value) {
      throw new Error('message not found or unauthorized');
    }
    return result.value;
  } catch (error) {
    console.error('error updating message:',error);
    throw error;
  }
}

export async function deleteMessage({messageId,senderId}){
  try {
    const client = await clientPromise;
    const db = client.db();

    const result = await db.collection('messages').deleteOne({
      _id: new ObjectId(messageId),
      senderId,
    });

    if(result.deletedCount === 0){
      throw new Error('messafe not found or unauthorized');
    }

    return{success:true};
  } catch (error) {
    console.error('Error deleting message:',error);
    throw error;
  }
}