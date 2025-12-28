import Provider from "@/app/providers/SessionProvider";
import type { ReactNode } from "react";
import './globals.css';
import { LocaleProvider } from "./components/provider/locale-provider";
import Navbar from "./components/ui/navbar";


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
      </body>
    </html>
  );
}
