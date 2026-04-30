// hooks/useTranscription.ts
// Desktop → Web Speech API (unchanged, real-time)
// Mobile  → MediaRecorder + browser-whisper WASM (free, on-device, no API key)

import { useRef, useState, useCallback, useEffect } from "react";
import { transcribe } from "browser-whisper";

// ─── helpers ───────────────────────────────────────────────────────────────

const isMobile = () =>
  /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(
    navigator.userAgent
  );

const webSpeechSupported = () =>
  !isMobile() &&
  ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

const getSupportedMimeType = () => {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
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
  const [error, setError] = useState(null);

  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  // ── Desktop: Web Speech API ──────────────────────────────────────────────

  const startDesktop = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
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
      setError(`Speech recognition error: ${e.error}`);
      setIsListening(false);
    };

    recognition.onend = () => setIsListening(false);

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

  const stopMobile = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return Promise.resolve();

    return new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        setIsListening(false);

        const mimeType = recorder.mimeType || "audio/webm";
        const audioBlob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];

        // Run Whisper entirely on-device — no server, no API key, no cost
        setIsTranscribing(true);
        setTranscribeProgress(0);

        try {
          const segments = await transcribe(audioBlob, {
            model: "tiny",           // ~31MB download, cached after first use
            onProgress: ({ progress }) => {
              setTranscribeProgress(progress ?? 0);
            },
          });

          const fullText = segments.map((s: any) => s.text).join(" ").trim();
          setTranscript(fullText);
        } catch (err: any) {
          setError(`Transcription failed: ${err.message}`);
        } finally {
          setIsTranscribing(false);
          setTranscribeProgress(0);
          resolve();
        }
      };

      recorder.stop();
    });
  }, []);

  // ── Public API ───────────────────────────────────────────────────────────

  const start = useCallback(() => {
    setTranscript("");
    setInterimTranscript("");
    setError(null);
    if (webSpeechSupported()) startDesktop();
    else startMobile();
  }, [startDesktop, startMobile]);

  // Always safe to await — resolves immediately on desktop,
  // resolves after Whisper finishes on mobile.
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
