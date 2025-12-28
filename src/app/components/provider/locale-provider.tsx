"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

interface LocaleContextType {
  locale: string;
  setLocale: (locale: string) => void;
}

const LocaleContext = createContext<LocaleContextType>({
  locale: "ru",
  setLocale: () => {},
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState("ru");

  useEffect(() => {
    // Load saved locale from localStorage
    const savedLocale = localStorage.getItem("locale") || "ru";
    console.log("LocaleProvider mounted, loaded locale:", savedLocale);
    setLocaleState(savedLocale);
  }, []);

  const setLocale = (newLocale: string) => {
    console.log("setLocale called with:", newLocale);
    localStorage.setItem("locale", newLocale);
    setLocaleState(newLocale);
    console.log("Locale updated to:", newLocale);
  };

  console.log("LocaleProvider rendering with locale:", locale);

  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export const useLocale = () => useContext(LocaleContext);