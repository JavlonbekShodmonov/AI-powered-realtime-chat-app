"use client";

import * as React from "react";
import { Languages } from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../../components/ui/dropdown-menu";
import { useLocale } from "../../components/provider/locale-provider";

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();

  console.log("LanguageToggle rendering with locale:", locale);

  const changeLanguage = (newLocale: string) => {
    console.log("changeLanguage called with:", newLocale);
    setLocale(newLocale);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={() => console.log("BUTTON CLICKED!")}
        >
          <Languages className="h-5 w-5" />
          <span className="sr-only">Toggle language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => changeLanguage("en")}>
          <span className="mr-2">🇺🇸</span>
          <span>English</span>
          {locale === "en" && <span className="ml-auto">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => changeLanguage("ru")}>
          <span className="mr-2">🇷🇺</span>
          <span>Русский</span>
          {locale === "ru" && <span className="ml-auto">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}