"use client";

import { useEffect, useState } from "react";
import { SPEECH_LANGUAGE_OPTIONS } from "@/app/hooks/useTranscription";
import { Globe } from "lucide-react";

export interface SpeechLanguagePickerProps {
  currentLang: string;
  onSelect: (lang: string) => void;
  disabled?: boolean;
}

export function SpeechLanguagePicker({
  currentLang,
  onSelect,
  disabled = false,
}: SpeechLanguagePickerProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/80 px-4 py-2 text-xs">
      <Globe className="h-4 w-4 text-cyan-400" />
      <select
        value={currentLang}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
        className="bg-transparent font-medium text-white outline-none cursor-pointer disabled:opacity-50"
      >
        {SPEECH_LANGUAGE_OPTIONS.map((opt) => (
          <option key={opt.code} value={opt.code} className="bg-slate-900 text-white">
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}