import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseInterceptors,
  UploadedFile,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { SpeechTranscriptsService } from "./speech-transcripts.service";

interface ExpressMulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Controller("api/ai")
export class SpeechTranscriptsController {
  constructor(
    private readonly transcriptsService: SpeechTranscriptsService
  ) {}

  @Get("summary/:roomId")
  async getSummary(@Param("roomId") roomId: string) {
    if (!roomId) {
      throw new HttpException("roomId is required", HttpStatus.BAD_REQUEST);
    }
    const summary = await this.transcriptsService.getLatestSummary(roomId);
    return summary || { fullSummary: null, userSummary: null };
  }

  @Post("speech-transcripts")
  async saveChunk(@Body() body: any) {
    const { roomId, userId, userName, text, timestamp } = body;
    if (!roomId || !text) {
      throw new HttpException("roomId and text are required", HttpStatus.BAD_REQUEST);
    }
    await this.transcriptsService.saveChunk({
      roomId,
      userId,
      userName,
      text,
      timestamp: timestamp || Date.now(),
    });
    return { success: true };
  }

  @Post("transcribe")
  @UseInterceptors(FileInterceptor("audio"))
  async transcribeAudio(@UploadedFile() file: ExpressMulterFile) {
    if (!file) {
      throw new HttpException("Audio file is required", HttpStatus.BAD_REQUEST);
    }

    try {
      const transcript = await this.transcriptsService.transcribeWithGroq(
        file.buffer,
        file.originalname || "recording.webm",
        file.mimetype || "audio/webm"
      );
      return { transcript };
    } catch (err: any) {
      throw new HttpException(
        err?.message || "Groq transcription failed",
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }
}