// hooks/useTranscription.ts
// Desktop → Web Speech API (unchanged, real-time)
// Mobile  → MediaRecorder + browser-whisper WASM (free, on-device, no API key)
// Force client-side only
"use client";

if (typeof window === "undefined") {
  throw new Error("useTranscription must be used client-side only");
}
import { useRef, useState, useCallback, useEffect } from "react";
interface WhisperModule {
  transcribe: (
    audio: Blob | Float32Array,
    options?: {
      language?: string;
      onProgress?: (p: any) => void;
    },
  ) => Promise<{ text: string }>;
}

const isMobile = () =>
  /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
    navigator.userAgent,
  );

const webSpeechSupported = () =>
  !isMobile() &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

const getSupportedMimeType = () => {
  const types = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg",
  ];
  return types.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
};

// ─── hook ──────────────────────────────────────────────────────────────────

/**
 * useTranscription()
 *
 * Returns:
 *   start()            – begin recording / listening
 *   stop()             – stop; on mobile triggers Whisper transcription
 *   transcript         – final text (available after stop() resolves)
 *   interimTranscript  – live partial text (desktop only, "" on mobile)
 *   isListening        – true while mic is active
 *   isTranscribing     – true while Whisper WASM is running (mobile only)
 *   transcribeProgress – 0–1 progress value during transcription (mobile only)
 *   error              – string | null
 *   isMobileMode       – true when using the WASM path
 */
export function useTranscription({ language = "en-US" } = {}) {
  const [transcript, setTranscript] = useState("");
  const [interimTranscript, setInterimTranscript] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeProgress, setTranscribeProgress] = useState(0);
  const [error, setError] = useState<null | string>(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef(false); // To track if we should be listening (handles auto-restarts)
  // ── Desktop: Web Speech API ──────────────────────────────────────────────

  const startDesktop = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (e: any) => {
      let final = "";
      let interim = "";
      for (const result of e.results) {
        if (result.isFinal) final += result[0].transcript + " ";
        else interim += result[0].transcript;
      }
      if (final) setTranscript((prev) => prev + final);
      setInterimTranscript(interim);
    };

    recognition.onerror = (e: any) => {
      // 'aborted' is non-fatal — just restart if we're still supposed to be listening
      if (e.error === "aborted" && isRecordingRef.current) {
        recognition.start();
        return;
      }
      setError(`Speech recognition error: ${e.error}`);
      setIsListening(false);
    };
    recognition.onend = () => {
      // If we're still supposed to be listening, restart (handles aborts)
      if (isRecordingRef.current) {
        recognition.start();
      } else {
        setIsListening(false);
      }
    };
    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
    setError(null);
  }, [language]);

  const stopDesktop = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  // ── Mobile: MediaRecorder → browser-whisper WASM ─────────────────────────

  const startMobile = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = getSupportedMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000);
      setIsListening(true);
      setError(null);
    } catch (err: any) {
      setError(`Microphone error: ${err.message}`);
    }
  }, []);

  const stopMobile = useCallback(async () => {
    setIsListening(false);
    if (
      !mediaRecorderRef.current ||
      mediaRecorderRef.current.state === "inactive"
    )
      return;

    // Create the promise before calling .stop() to ensure we catch the event
    const blobPromise = new Promise<Blob>((resolve) => {
      mediaRecorderRef.current!.onstop = () => {
        const blob = new Blob(chunksRef.current, {
          type: getSupportedMimeType(),
        });
        resolve(blob);
      };
    });

    mediaRecorderRef.current.stop();
    const audioBlob = await blobPromise;

    // Stop the actual mic hardware to turn off the "green light" on the phone
    streamRef.current?.getTracks().forEach((track) => track.stop());

    try {
      setIsTranscribing(true);
      setTranscribeProgress(0.2);

      const groqApiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
      if (!groqApiKey) throw new Error("GROQ_API_KEY not set");

      const ext = audioBlob.type.includes("mp4") ? "mp4" : "webm";
      const file = new File([audioBlob], `recording.${ext}`, {
        type: audioBlob.type,
      });

      const formData = new FormData();
      formData.append("file", file);
      formData.append("model", "whisper-large-v3-turbo");
      formData.append("language", language.split("-")[0]);
      formData.append("response_format", "json");

      setTranscribeProgress(0.5);

      const res = await fetch(
        "https://api.groq.com/openai/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqApiKey}`,
          },
          body: formData,
        },
      );

      if (!res.ok) {
        const err = await res.text();
        throw new Error(`Groq error: ${err}`);
      }

      const data = await res.json();
      setTranscribeProgress(1);
      setTranscript(data.text ?? "");
    } catch (err: any) {
      setError(err.message || "Transcription failed");
    } finally {
      setIsTranscribing(false);
      setTranscribeProgress(0);
    }
  }, [language]); // ← this closes stopMobile

  // ── Public API ───────────────────────────────────────────────────────────

  const start = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    if (webSpeechSupported()) startDesktop();
    else startMobile();
  }, [startDesktop, startMobile]);

  const stop = useCallback(() => {
    if (webSpeechSupported()) {
      stopDesktop();
      return Promise.resolve();
    }
    return stopMobile();
  }, [stopDesktop, stopMobile]);

  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
      mediaRecorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return {
    start,
    stop,
    transcript,
    interimTranscript,
    isListening,
    isTranscribing,
    transcribeProgress,
    error,
    isMobileMode: !webSpeechSupported(),
  };
}
