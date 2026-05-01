import Provider from "@/app/providers/SessionProvider";
import type { ReactNode } from "react";
import './globals.css';
import { LocaleProvider } from "./components/provider/locale-provider";
import Navbar from "./components/ui/navbar";
import Script from "next/script";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Script src="/coi-serviceworker.js" strategy="beforeInteractive" />
        <LocaleProvider>
          <Provider>
            <Navbar />
            {children}
          </Provider>
        </LocaleProvider>

        {/* --- CHATBASE AI AGENT --- */}
        <Script
          id="chatbase-loader"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `...`,
          }}
        />
      </body>
    </html>
  );
}