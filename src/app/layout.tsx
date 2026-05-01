import Provider from "@/app/providers/SessionProvider";
import type { ReactNode } from "react";
import "./globals.css";
import { LocaleProvider } from "./components/provider/locale-provider";
import Navbar from "./components/ui/navbar";
import Script from "next/script";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LocaleProvider>
          <Provider>
            <Navbar />
            {children}
          </Provider>
        </LocaleProvider>

        <Script id="unregister-sw" strategy="afterInteractive">{`
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(registrations => {
      registrations.forEach(r => r.unregister());
    });
  }
`}</Script>
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
