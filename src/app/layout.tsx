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
            __html: `
            (function(){if(!window.chatbase||window.chatbase("getState")!=="initialized"){window.chatbase=(...arguments)=>{if(!window.chatbase.q){window.chatbase.q=[]}window.chatbase.q.push(arguments)};window.chatbase=new Proxy(window.chatbase,{get(target,prop){if(prop==="q"){return target.q}return(...args)=>target(prop,...args)}})}const onLoad=function(){const script=document.createElement("script");script.src="https://www.chatbase.co/embed.min.js";script.id="YWgNZc-S-nX1m8dOjmfCg";script.domain="www.chatbase.co";document.body.appendChild(script)};if(document.readyState==="complete"){onLoad()}else{window.addEventListener("load",onLoad)}})();
            `,
          }}
        />
      </body>
    </html>
  );
}