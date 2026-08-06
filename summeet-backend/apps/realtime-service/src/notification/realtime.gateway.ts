import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { Logger } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { MongoClient, ObjectId } from 'mongodb';

@WebSocketGateway({
  path: '/socket.io',
  cors: {
    origin: ['http://localhost:3000', 'https://summeet.live', 'https://summeet.vercel.app'],
    credentials: true,
  },
})
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(RealtimeGateway.name);
  private mongoClient: MongoClient;
  private dbReady: Promise<void>;

  constructor(@InjectRedis() private readonly redis: Redis) {
    this.mongoClient = new MongoClient(process.env.MONGODB_URI || '');
    this.dbReady = this.mongoClient.connect().then(() => undefined);
  }

  private async getDb() {
    await this.dbReady;
    // Matches the old Next.js code's `client.db(process.env.MONGODB_DB)`.
    // If MONGODB_DB isn't set, this falls back to whatever db is embedded
    // in MONGODB_URI — safe either way, but worth confirming ai-service uses
    // the identical env var, since a mismatch there would mean AI summaries
    // and chat messages are silently reading/writing different databases.
    return this.mongoClient.db(process.env.MONGODB_DB);
  }

  async handleConnection(socket: Socket) {
    const token = socket.handshake.auth?.token;
    if (!token) {
      this.logger.warn(`Socket ${socket.id} connected with no auth token — disconnecting`);
      socket.disconnect();
      return;
    }

    const secret = process.env.SOCKET_AUTH_SECRET;
    if (!secret) {
      this.logger.error('SOCKET_AUTH_SECRET is not set — refusing all socket connections');
      socket.disconnect();
      return;
    }

    let decoded: any;
    try {
      decoded = jwt.verify(token, secret);
    } catch (err) {
      this.logger.warn(`Socket ${socket.id} sent an invalid/expired token — disconnecting`);
      socket.disconnect();
      return;
    }

    const userId = String(decoded.userId);
    const userName = decoded.userName || 'Anonymous';

    socket.data.userId = userId;
    socket.data.userName = userName;
    socket.data.joinedRooms = new Set<string>();

    socket.join(`user:${userId}`);

    await this.redis.sadd(`user:sockets:${userId}`, socket.id);
    await this.redis.hset('user:presence', userId, JSON.stringify({ name: userName, online: true }));
  }

  async handleDisconnect(socket: Socket) {
    const userId = socket.data.userId;
    if (!userId) return;

    await this.redis.srem(`user:sockets:${userId}`, socket.id);
    const activeSockets = await this.redis.smembers(`user:sockets:${userId}`);

    if (activeSockets.length === 0) {
      await this.redis.hdel('user:presence', userId);

      const joinedRooms: Set<string> = socket.data.joinedRooms || new Set();
      for (const roomId of joinedRooms) {
        await this.redis.srem(`room:${roomId}:users`, userId);
        this.broadcastRoomUsers(roomId);
      }
    }
  }

  @SubscribeMessage('joinRoom')
  async handleJoinRoom(
    @ConnectedSocket() socket: Socket,
    @MessageBody() data: { roomId: string; cursor?: string; limit?: number },
  ) {
    socket.join(data.roomId);
    socket.data.joinedRooms?.add(data.roomId);
    await this.redis.sadd(`room:${data.roomId}:users`, socket.data.userId);

    // Restored — this was missing entirely from the migrated gateway,
    // which meant joining a room showed an empty conversation until new
    // messages arrived. Ported directly from the old lib/getMessagesForRoom.ts.
    try {
      const messages = await this.getMessagesForRoom(data.roomId, data.cursor, data.limit ?? 20);
      socket.emit('initialMessages', messages);
    } catch (err) {
      this.logger.error(`Error loading initial messages for room ${data.roomId}: ${err}`);
      socket.emit('initialMessages', []);
    }

    this.broadcastRoomUsers(data.roomId);
  }

  // Ported from lib/getMessagesForRoom.ts. NOTE: uses process.env.MONGODB_DB
  // the same way the old Next.js code did — if that env var isn't set here,
  // MongoClient falls back to whatever db is embedded in MONGODB_URI, so
  // this is safe either way, but worth confirming both are set consistently
  // across ai-service and realtime-service (see my note below).
  private async getMessagesForRoom(roomId: string, cursor?: string, limit: number = 20) {
    const db = await this.getDb();
    const query: any = { roomId };
    if (cursor && ObjectId.isValid(cursor)) {
      query._id = { $lt: new ObjectId(cursor) };
    }

    const messages = await db
      .collection('messages')
      .find(query)
      .sort({ _id: -1 })
      .limit(limit)
      .toArray();

    const senderIds = [...new Set(messages.map((m: any) => m.senderId))];
    const validSenderIds = senderIds.filter((id) => ObjectId.isValid(id));

    const users = validSenderIds.length > 0
      ? await db.collection('users').find({ _id: { $in: validSenderIds.map((id) => new ObjectId(id)) } })
          .project({ _id: 1, name: 1 }).toArray()
      : [];

    const userMap = new Map(users.map((u: any) => [u._id.toString(), u.name || 'Guest']));

    return messages.reverse().map((m: any) => ({
      _id: m._id.toString(),
      roomId: m.roomId,
      senderId: m.senderId,
      sender: { _id: m.senderId, name: userMap.get(m.senderId) || 'Guest' },
      content: m.content,
      createdAt: m.createdAt,
    }));
  }

  @SubscribeMessage('leaveRoom')
  async handleLeaveRoom(@ConnectedSocket() socket: Socket, @MessageBody() data: { roomId: string }) {
    socket.leave(data.roomId);
    socket.data.joinedRooms?.delete(data.roomId);
    await this.redis.srem(`room:${data.roomId}:users`, socket.data.userId);
    this.broadcastRoomUsers(data.roomId);
  }

  @SubscribeMessage('leaveMeeting')
  async handleLeaveMeeting(@ConnectedSocket() socket: Socket, @MessageBody() data: { meetingId: string }) {
    socket.leave(data.meetingId);
    socket.data.joinedRooms?.delete(data.meetingId);
    this.server.to(data.meetingId).emit('user-left', { userId: socket.data.userId });
    await this.redis.srem(`room:${data.meetingId}:users`, socket.data.userId);
  }

  @SubscribeMessage('call-started')
  async handleCallStarted(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const { roomId, callerId, callerName, meetingId, timestamp } = data;
    socket.to(roomId).emit('incoming-call', { callerId, callerName, meetingId, timestamp });

    try {
      const db = await this.getDb();
      await db.collection('messages').insertOne({
        roomId,
        senderId: 'system',
        senderName: 'System',
        content: `📞 ${callerName} started a video call`,
        type: 'system',
        createdAt: new Date(timestamp),
      });
    } catch (err) {
      this.logger.error(`Error saving call-start system message: ${err}`);
    }
  }

  @SubscribeMessage('call-ended')
  async handleCallEnded(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const { roomId, callerId, callerName, duration, timestamp } = data;
    this.server.to(roomId).emit('call-ended', { callerId, callerName, duration, timestamp });

    const minutes = Math.floor(duration / 60);
    const seconds = duration % 60;
    const durationText = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

    try {
      const db = await this.getDb();
      await db.collection('messages').insertOne({
        roomId,
        senderId: 'system',
        senderName: 'System',
        content: `📞 Call ended • Duration: ${durationText}`,
        type: 'system',
        createdAt: new Date(timestamp),
      });
    } catch (err) {
      this.logger.error(`Error saving call-end system message: ${err}`);
    }
  }

  // Restored. Writes to `videocall_speech_transcripts` — the SAME collection
  // ai.processor.ts's summarizer reads from — instead of the old
  // `videocall_transcripts`, which the summarizer never looked at. Field
  // names (userId/text) also now match what the summarizer expects
  // (m.userId, m.text, m.timestamp, m.userName, m.language), whereas the old
  // handler used senderId/content — a mismatch that would have made every
  // video-call transcript silently invisible to summarization.
  //
  // Client payload expected: { roomId, userId, text, timestamp, language? }
  // (language optional — include it if Groq's response provides a detected
  // language, so detectVideoCallLanguage() in ai.service.ts can use it).
  @SubscribeMessage('transcript:new')
  async handleTranscriptNew(@ConnectedSocket() socket: Socket, @MessageBody() payload: any) {
    const { roomId, userId, text, timestamp, language } = payload;
    if (!roomId || !userId || !text) return;

    try {
      const db = await this.getDb();
      const transcript = {
        roomId,
        userId,
        userName: socket.data.userName,
        text,
        language: language || null,
        timestamp: timestamp ? new Date(timestamp) : new Date(),
      };

      const result = await db.collection('videocall_speech_transcripts').insertOne(transcript);

      this.server.to(roomId).emit('transcript:created', {
        ...transcript,
        _id: result.insertedId.toString(),
      });
    } catch (err) {
      this.logger.error(`Error saving transcript: ${err}`);
    }
  }

  // Restored chat message CRUD, using the same raw-driver pattern and
  // `messages` collection shape (roomId, senderId, content, createdAt)
  // ai.service.ts already reads for text-chat summarization — so this stays
  // consistent with data the AI pipeline expects, rather than introducing a
  // second schema.
  @SubscribeMessage('sendMessage')
  async handleSendMessage(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const { roomId, content } = data;
    const senderId = socket.data.userId;
    if (!roomId || !content || !senderId) return;

    try {
      const db = await this.getDb();
      const doc = {
        roomId,
        senderId,
        content,
        createdAt: new Date(),
      };
      const result = await db.collection('messages').insertOne(doc);

      const presenceRaw = await this.redis.hget('user:presence', senderId);
      const senderName = presenceRaw ? JSON.parse(presenceRaw).name : socket.data.userName;

      this.server.to(roomId).emit('newMessage', {
        ...doc,
        _id: result.insertedId.toString(),
        sender: { id: senderId, name: senderName },
      });
    } catch (err) {
      this.logger.error(`Error sending message: ${err}`);
    }
  }

  @SubscribeMessage('editMessage')
  async handleEditMessage(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const { messageId, roomId, newContent } = data;
    const senderId = socket.data.userId;
    if (!messageId || !roomId || !newContent || !senderId) return;

    try {
      const db = await this.getDb();
      // Atomic ownership check — filters on _id AND senderId in the same
      // call, matching lib/message.controller.ts's updateMessage(), instead
      // of a separate read-then-check (which has a race window between the
      // two operations).
      const result = await db.collection('messages').findOneAndUpdate(
        { _id: new ObjectId(messageId), senderId },
        { $set: { content: newContent, editedAt: new Date() } },
        { returnDocument: 'after' },
      );

      if (!result) {
        this.logger.warn(`User ${senderId} attempted to edit a message they don't own or that doesn't exist`);
        return;
      }

      this.server.to(roomId).emit('messageEdited', {
        _id: messageId,
        content: newContent,
        editedAt: result.editedAt,
      });
    } catch (err) {
      this.logger.error(`Error editing message: ${err}`);
    }
  }

  @SubscribeMessage('deleteMessage')
  async handleDeleteMessage(@ConnectedSocket() socket: Socket, @MessageBody() data: any) {
    const { messageId, roomId } = data;
    const senderId = socket.data.userId;
    if (!messageId || !roomId || !senderId) return;

    try {
      const db = await this.getDb();
      // Same atomic filter pattern as edit — matches deleteMessage() in
      // lib/message.controller.ts.
      const result = await db.collection('messages').deleteOne({
        _id: new ObjectId(messageId),
        senderId,
      });

      if (result.deletedCount === 0) {
        this.logger.warn(`User ${senderId} attempted to delete a message they don't own or that doesn't exist`);
        return;
      }

      this.server.to(roomId).emit('messageDeleted', messageId);
    } catch (err) {
      this.logger.error(`Error deleting message: ${err}`);
    }
  }

  private async broadcastRoomUsers(roomId: string) {
    const userIds = await this.redis.smembers(`room:${roomId}:users`);
    const onlineInRoom = [];

    for (const id of userIds) {
      const presenceRaw = await this.redis.hget('user:presence', id);
      if (presenceRaw) {
        const presence = JSON.parse(presenceRaw);
        onlineInRoom.push({ id, name: presence.name });
      }
    }

    this.server.to(roomId).emit('onlineUsersWithNames', onlineInRoom);
  }
}
