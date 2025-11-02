import Provider from "@/app/providers/SessionProvider";
import type { ReactNode } from "react";
import './globals.css';


export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Provider>{children}</Provider>
      </body>
    </html>
  );
}
