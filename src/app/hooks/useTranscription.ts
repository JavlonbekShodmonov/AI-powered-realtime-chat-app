"use client";

import { useState, useRef, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

export type TranscriptionEngine = "webspeech" | "groq";
export type TranscriptionStatus =
  | "idle"
  | "recording"
  | "transcribing" // mobile only: uploading to Groq
  | "done"
  | "error";

export interface SpeechLanguageOption {
  code: string; // BCP-47 tag passed to recognition.lang
  label: string; // shown in the UI
}

export const SPEECH_LANGUAGE_OPTIONS: SpeechLanguageOption[] = [
  { code: "en-US", label: "English" },
  { code: "ru-RU", label: "Русский" },
  { code: "uz-UZ", label: "O'zbekcha" },
  { code: "kk-KZ", label: "Қазақша" },
  { code: "tr-TR", label: "Türkçe" },
  { code: "es-ES", label: "Español" },
  { code: "fr-FR", label: "Français" },
  { code: "de-DE", label: "Deutsch" },
  { code: "ar-SA", label: "العربية" },
  { code: "zh-CN", label: "中文" },
];

const DEFAULT_SPEECH_LANG = "en-US";

interface TranscriptionOptions {
  roomId: string;
  userId: string;
  userName: string;
  onChunk?: (text: string) => void;
  onError?: (message: string) => void;
  onStatusChange?: (status: TranscriptionStatus) => void;
}

interface TranscriptionState {
  transcript: string;
  interimTranscript: string;
  status: TranscriptionStatus;
  engine: TranscriptionEngine;
  isRecording: boolean;
  isTranscribing: boolean;
  speechLang: string;
}

function detectEngine(): TranscriptionEngine {
  if (typeof window === "undefined") return "groq";
  const mobile = /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
    navigator.userAgent
  );
  if (mobile) return "groq";
  const hasWebSpeech =
    "webkitSpeechRecognition" in window || "SpeechRecognition" in window;
  return hasWebSpeech ? "webspeech" : "groq";
}

// ─── Save transcript chunk to NestJS microservice ──────────────────────────

async function saveChunk(
  roomId: string,
  userId: string,
  userName: string,
  text: string
): Promise<void> {
  try {
    const baseUrl =
      process.env.NEXT_PUBLIC_AI_SERVICE_URL ||
      "https://summeet-live.onrender.com";
    await fetch(`${baseUrl}/api/ai/speech-transcripts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        roomId,
        userId,
        userName,
        text: text.trim(),
        timestamp: Date.now(),
      }),
    });
  } catch (err) {
    console.warn("Failed to save transcript chunk:", err);
  }
}

// ─── Send audio blob to NestJS Groq transcription endpoint ─────────────────

async function sendToGroq(audioBlob: Blob): Promise<string> {
  const formData = new FormData();
  formData.append("audio", audioBlob, "recording.webm");

  const baseUrl = process.env.NEXT_PUBLIC_AI_SERVICE_URL || "https://summeet-live.onrender.com";
  const res = await fetch(`${baseUrl}/api/ai/transcribe`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `Transcription failed (${res.status})`);
  }

  const data = await res.json();
  return data.transcript as string;
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useTranscription(options: TranscriptionOptions) {
  const { roomId, userId, userName, onChunk, onError, onStatusChange } = options;

  const engine = detectEngine();

  const [state, setState] = useState<TranscriptionState>({
    transcript: "",
    interimTranscript: "",
    status: "idle",
    engine,
    isRecording: false,
    isTranscribing: false,
    speechLang: DEFAULT_SPEECH_LANG,
  });

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const finalTranscriptRef = useRef<string>("");
  const lastSavedLengthRef = useRef<number>(0);
  const speechLangRef = useRef<string>(DEFAULT_SPEECH_LANG);

  function setStatus(status: TranscriptionStatus) {
    setState((s) => ({
      ...s,
      status,
      isRecording: status === "recording",
      isTranscribing: status === "transcribing",
    }));
    onStatusChange?.(status);
  }

  function handleError(message: string) {
    setStatus("error");
    onError?.(message);
    console.error("[useTranscription]", message);
  }

  async function saveNewChunk(fullText: string) {
    const newPart = fullText.slice(lastSavedLengthRef.current).trim();
    if (!newPart) return;
    lastSavedLengthRef.current = fullText.length;
    await saveChunk(roomId, userId, userName, newPart);
    onChunk?.(newPart);
  }

  // ── WebSpeech (desktop Chrome / Edge) ────────────────────────────────────

  const startWebSpeech = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      handleError("SpeechRecognition not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = speechLangRef.current;

    recognitionRef.current = recognition;
    finalTranscriptRef.current = "";
    lastSavedLengthRef.current = 0;

    recognition.onresult = async (event: any) => {
      let interim = "";

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscriptRef.current += chunk + " ";
          await saveNewChunk(finalTranscriptRef.current);
        } else {
          interim += chunk;
        }
      }

      setState((s) => ({
        ...s,
        transcript: finalTranscriptRef.current,
        interimTranscript: interim,
      }));
    };

    recognition.onerror = (event: any) => {
      if (event.error === "no-speech") return;
      handleError(`Speech recognition error: ${event.error}`);
    };

    recognition.onend = () => {
      if (recognitionRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started
        }
      }
    };

    recognition.start();
    setStatus("recording");
  }, [roomId, userId, userName]);

  const stopWebSpeech = useCallback((): string => {
    if (recognitionRef.current) {
      recognitionRef.current.onend = null;
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setState((s) => ({ ...s, interimTranscript: "" }));
    setStatus("done");
    return finalTranscriptRef.current.trim();
  }, []);

  const setSpeechLang = useCallback(
    (langCode: string) => {
      speechLangRef.current = langCode;
      setState((s) => ({ ...s, speechLang: langCode }));

      if (engine === "webspeech" && recognitionRef.current) {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
        recognitionRef.current = null;
        startWebSpeech();
      }
    },
    [engine, startWebSpeech]
  );

  // ── Groq Whisper (mobile) ─────────────────────────────────────────────────

  const startMobileRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      finalTranscriptRef.current = "";
      lastSavedLengthRef.current = 0;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setStatus("transcribing");

        try {
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          const text = await sendToGroq(audioBlob);

          finalTranscriptRef.current = text;
          await saveChunk(roomId, userId, userName, text);
          onChunk?.(text);

          setState((s) => ({ ...s, transcript: text }));
          setStatus("done");
        } catch (err: any) {
          handleError(err.message || "Groq transcription failed");
        }
      };

      mediaRecorder.start(1000);
      setStatus("recording");
    } catch (err: any) {
      handleError(`Microphone access error: ${err.message}`);
    }
  }, [roomId, userId, userName]);

  const stopMobileRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state !== "inactive"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  // ── Public API ────────────────────────────────────────────────────────────

  const start = useCallback(async () => {
    finalTranscriptRef.current = "";
    lastSavedLengthRef.current = 0;
    setState((s) => ({ ...s, transcript: "", interimTranscript: "" }));

    if (engine === "webspeech") {
      startWebSpeech();
    } else {
      await startMobileRecording();
    }
  }, [engine, startWebSpeech, startMobileRecording]);

  const stop = useCallback((): string => {
    if (engine === "webspeech") {
      return stopWebSpeech();
    } else {
      stopMobileRecording();
      return "";
    }
  }, [engine, stopWebSpeech, stopMobileRecording]);

  return {
    ...state,
    start,
    stop,
    setSpeechLang,
  };
}