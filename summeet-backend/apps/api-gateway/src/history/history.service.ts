import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class HistoryService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async searchHistory(query: string) {
    const db = this.connection.db;
    const collections = ['videocall_speech_transcripts', 'videocall_transcripts'];
    const searchRegex = query ? new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : null;

    const roomMap = new Map<string, any>();

    for (const collectionName of collections) {
      const collection = db.collection(collectionName);
      const filter = searchRegex
        ? {
            $or: [
              { text: searchRegex },
              { content: searchRegex },
              { userName: searchRegex },
              { senderName: searchRegex },
              { roomId: searchRegex },
            ],
          }
        : {};

      const docs = await collection.find(filter).sort({ timestamp: -1, createdAt: -1 }).toArray();

      for (const doc of docs) {
        const roomId = doc.roomId ? String(doc.roomId) : '';
        if (!roomId) continue;

        const existing = roomMap.get(roomId) || {
          roomId,
          participants: new Set<string>(),
          transcriptCount: 0,
          lastActivity: 0,
          snippet: '',
        };

        const participantName = doc.userName || doc.senderName || 'Unknown';
        existing.participants.add(participantName);
        existing.transcriptCount += 1;

        const timestamp = doc.timestamp || doc.createdAt || Date.now();
        const text = doc.text || doc.content || '';

        const parsedTimestamp = typeof timestamp === 'number' ? timestamp : Date.parse(String(timestamp));
        if (!Number.isNaN(parsedTimestamp) && parsedTimestamp > existing.lastActivity) {
          existing.lastActivity = parsedTimestamp;
          existing.snippet = text ? String(text).slice(0, 280) : '';
        }

        roomMap.set(roomId, existing);
      }
    }

    const results = Array.from(roomMap.values())
      .map((item) => ({
        _id: item.roomId,
        roomId: item.roomId,
        participants: Array.from(item.participants).filter(Boolean),
        lastActivity: item.lastActivity || Date.now(),
        snippet: item.snippet || '',
        transcriptCount: item.transcriptCount || 0,
        topics: query ? [query] : [],
        decisions: [],
        actionItems: [],
      }))
      .sort((a, b) => Number(b.lastActivity) - Number(a.lastActivity))
      .slice(0, 16);

    return results;
  }
}