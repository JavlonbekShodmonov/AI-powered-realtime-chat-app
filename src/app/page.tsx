"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import React from "react";
import { useLocale } from "./components/provider/locale-provider";

export default function Home() {
  const { data: session } = useSession();
  const { locale } = useLocale();

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950">
      {/* Animated background */}
      <div className="absolute inset-0 overflow-hidden">
        {/* Gradient orbs */}
        <div className="absolute -top-1/2 -left-1/4 w-[800px] h-[800px] bg-gradient-to-br from-cyan-500/30 to-blue-600/30 rounded-full blur-3xl animate-pulse"></div>
        <div
          className="absolute -bottom-1/2 -right-1/4 w-[800px] h-[800px] bg-gradient-to-br from-purple-500/30 to-pink-600/30 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "1s" }}
        ></div>
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-gradient-to-br from-indigo-500/20 to-violet-600/20 rounded-full blur-3xl animate-pulse"
          style={{ animationDelay: "2s" }}
        ></div>

        {/* Grid pattern overlay */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:72px_72px]"></div>

        {/* Noise texture */}
        <div className="absolute inset-0 opacity-[0.015] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIzMDAiIGhlaWdodD0iMzAwIj48ZmlsdGVyIGlkPSJhIiB4PSIwIiB5PSIwIj48ZmVUdXJidWxlbmNlIGJhc2VGcmVxdWVuY3k9Ii43NSIgc3RpdGNoVGlsZXM9InN0aXRjaCIgdHlwZT0iZnJhY3RhbE5vaXNlIi8+PGZlQ29sb3JNYXRyaXggdHlwZT0ic2F0dXJhdGUiIHZhbHVlcz0iMCIvPjwvZmlsdGVyPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbHRlcj0idXJsKCNhKSIvPjwvc3ZnPg==')]"></div>
      </div>
      {/* Content */}
      <div className="relative z-10 flex min-h-screen items-center justify-center px-4 py-20">
        <div className="max-w-5xl w-full">
          {/* Logo/Brand */}
          <div className="text-center mb-8 animate-[fadeInDown_0.6s_ease-out]">
            <div className="inline-flex items-center gap-3 mb-6">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-blue-600 blur-lg opacity-50"></div>
                <svg
                  className="relative w-12 h-12"
                  viewBox="0 0 48 48"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M24 4L44 14V34L24 44L4 34V14L24 4Z"
                    fill="url(#gradient)"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <circle cx="24" cy="18" r="4" fill="white" />
                  <circle cx="16" cy="28" r="3" fill="white" />
                  <circle cx="32" cy="28" r="3" fill="white" />
                  <line
                    x1="24"
                    y1="22"
                    x2="16"
                    y2="25"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <line
                    x1="24"
                    y1="22"
                    x2="32"
                    y2="25"
                    stroke="white"
                    strokeWidth="2"
                  />
                  <defs>
                    <linearGradient id="gradient" x1="4" y1="4" x2="44" y2="44">
                      <stop offset="0%" stopColor="#06b6d4" />
                      <stop offset="100%" stopColor="#3b82f6" />
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <span className="text-4xl font-bold bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent tracking-tight">
                SumMeet
              </span>
            </div>
          </div>

          {/* Hero section */}
          <div className="text-center mb-12 space-y-6">
            <h1
              className="text-6xl md:text-7xl lg:text-8xl font-black text-white tracking-tight leading-none animate-[fadeInUp_0.8s_ease-out]"
              style={{ fontFamily: "'Outfit', 'Inter', sans-serif" }}
            >
              <span className="block mb-2">
                {locale === "ru" ? "Встречи." : "Meetings."}
              </span>
              <span className="block bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-400 bg-clip-text text-transparent">
                {locale === "ru"
                  ? "Плагин для видеовстреч." 
                  : "A plugin for video calls."}
              </span>
            </h1>
 
            <p
              className="text-xl md:text-2xl text-slate-300 max-w-3xl mx-auto leading-relaxed animate-[fadeInUp_1s_ease-out]"
              style={{
                animationDelay: "0.2s",
                opacity: 0,
                animationFillMode: "forwards",
              }}
            >
              {locale === "ru"
                ? "SumMeet подключается к существующим видеозвонкам, слушает разговор и создает мгновенные резюме, подсказки для ответа и историю встреч."
                : "SumMeet plugs into your existing video calls, listens to the conversation, and delivers instant summaries, live response suggestions, and searchable meeting history."}
            </p>
            {/* Feature highlights */}
            <div
              className="flex flex-wrap justify-center gap-4 pt-4 animate-[fadeInUp_1.2s_ease-out]"
              style={{
                animationDelay: "0.4s",
                opacity: 0,
                animationFillMode: "forwards",
              }}
            >
              {[
                {
                  icon: "🎥",
                  text: locale === "ru" ? "Видеозвонки HD" : "HD Video Calls",
                },
                {
                  icon: "📝",
                  text: locale === "ru" ? "AI-резюме" : "AI Summaries",
                },
                {
                  icon: "🔍",
                  text:
                    locale === "ru"
                      ? "Поиск по встречам"
                      : "Searchable Meetings",
                },
              ].map((feature, index) => (
                <div
                  key={index}
                  className="px-6 py-3 bg-white/5 backdrop-blur-sm border border-white/10 rounded-full text-slate-200 text-sm font-medium hover:bg-white/10 hover:scale-105 transition-all duration-300"
                >
                  <span className="mr-2">{feature.icon}</span>
                  {feature.text}
                </div>
              ))}
            </div>
          </div>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            {!session ? (
              <>
                <button
                  onClick={() => signIn("google", { callbackUrl: "/meeting" })}
                  className="group relative px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-2xl shadow-blue-500/50 transition-all duration-300 transform hover:scale-105 hover:shadow-blue-500/70 w-full sm:w-auto overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative flex items-center justify-center gap-3">
                    <svg
                      className="w-5 h-5"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                    >
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                    <span>
                      {locale === "ru"
                        ? "Войти через Google"
                        : "Sign in with Google"}
                    </span>
                  </div>
                </button>

                <button
                  onClick={() => signIn("github", { callbackUrl: "/meeting" })}
                  className="group relative px-10 py-4 bg-white/10 backdrop-blur-sm border-2 border-white/20 text-white font-bold rounded-xl transition-all duration-300 transform hover:scale-105 hover:bg-white/20 hover:border-white/30 w-full sm:w-auto overflow-hidden"
                >
                  <div className="relative flex items-center justify-center gap-3">
                    <svg
                      className="w-5 h-5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                    </svg>
                    <span>
                      {locale === "ru"
                        ? "Войти через GitHub"
                        : "Sign in with GitHub"}
                    </span>
                  </div>
                </button>
              </>
            ) : (
              <>
                <a
                  href="/meeting"
                  className="group relative px-10 py-4 bg-gradient-to-r from-cyan-500 to-blue-600 text-white font-bold rounded-xl shadow-2xl shadow-blue-500/50 transition-all duration-300 transform hover:scale-105 hover:shadow-blue-500/70 w-full sm:w-auto text-center overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-blue-600 to-cyan-500 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  <div className="relative flex items-center justify-center gap-2">
                    <span>
                      {locale === "ru" ? "Открыть панель" : "Open Dashboard"}
                    </span>
                    <svg
                      className="w-5 h-5 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  </div>
                </a>

                <button
                  onClick={() => signOut()}
                  className="px-10 py-4 bg-white/10 backdrop-blur-sm border-2 border-white/20 text-white font-bold rounded-xl transition-all duration-300 transform hover:scale-105 hover:bg-white/20 hover:border-white/30 w-full sm:w-auto"
                >
                  {locale === "ru" ? "Выйти" : "Sign Out"}
                </button>
              </>
            )}
          </div>

          {/* Social proof / Stats */}
          <div
            className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-6 animate-[fadeInUp_1.6s_ease-out]"
            style={{
              animationDelay: "0.8s",
              opacity: 0,
              animationFillMode: "forwards",
            }}
          >
            {[
              {
                label: locale === "ru" ? "Часов сэкономлено" : "Hours Saved",
                value: "*",
                icon: "⏱️",
              },
              {
                label: locale === "ru" ? "Встреч проведено" : "Meetings Held",
                value: "*",
                icon: "📊",
              },
              {
                label:
                  locale === "ru" ? "Активных пользователей" : "Active Users",
                value: "100+",
                icon: "👥",
              },
            ].map((stat, index) => (
              <div
                key={index}
                className="text-center p-6 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl hover:bg-white/10 transition-all duration-300 hover:scale-105"
                style={{ animationDelay: `${1 + index * 0.1}s` }}
              >
                <div className="text-4xl mb-2">{stat.icon}</div>
                <div className="text-3xl font-bold text-white mb-1">
                  {stat.value}
                </div>
                <div className="text-slate-400 text-sm">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Support section */}
          <div
            className="mt-16 text-center animate-[fadeIn_2s_ease-out]"
            style={{
              animationDelay: "1.2s",
              opacity: 0,
              animationFillMode: "forwards",
            }}
          >
            <p className="text-slate-400 text-sm">
              {locale === "ru"
                ? "Нужна помощь? Напишите нам:"
                : "Need help? Contact us at"}{" "}
              <a
                href="mailto:shadmanov.summeet@gmail.com"
                className="text-cyan-400 hover:text-cyan-300 underline underline-offset-4 transition-colors"
              >
                shadmanov.summeet@gmail.com
              </a>
            </p>
          </div>

          {/* --- PITCH DAY REQUIREMENTS SECTION --- */}
          <div className="relative z-20 mt-20 pt-10 border-t border-white/10">
            <div className="max-w-3xl mx-auto text-left space-y-12">
              {/* DEMO BUTTON - High Visibility */}
              <div className="text-center">
                <a
                  href="/demo"
                  className="inline-block px-8 py-4 bg-orange-600 hover:bg-orange-500 text-white text-2xl font-black rounded-full shadow-lg shadow-orange-900/20 transition-all hover:scale-110 active:scale-95 cursor-pointer"
                  style={{ position: "relative", zIndex: 50 }}
                >
                  🚀 GO TO DEMO PAGE
                </a>
              </div>

              {/* 1. Problem & Solution */}
              <section className="text-slate-200">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">
                  1. Problem & Solution
                </h2>
                <p className="mb-4">
                  <strong className="text-white">Problem:</strong> Teams waste
                  30% of their time in meetings without clear documentation,
                  leading to lost action items and misalignment.
                </p>
                <p>
                  <strong className="text-white">Solution:</strong> Summeet uses
                  AI to capture, transcribe, and summarize meetings instantly,
                  ensuring nothing is ever forgotten.
                </p>
              </section>

              {/* 2 & 3. Team & Stack */}
              <section className="text-slate-200">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">
                  2. The Team
                </h2>
                <p className="mb-2">
                  <strong className="text-white">Roles:</strong> CEO, CFO, CTO,
                  Mobilographer
                </p>
                <p className="mb-4">
                  <strong className="text-white">Stack:</strong> Next.js,
                  TypeScript, Node.js, MongoDB, Gemini API
                </p>
                <p>
                  <strong className="text-white">Why us:</strong> We are a
                  diverse team of specialists passionate about solving workplace
                  inefficiency through cutting-edge AI integration.
                </p>
              </section>

              {/* 4. Roadmap */}
              <section className="text-slate-200">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">
                  3. Roadmap
                </h2>
                <ul className="space-y-3">
                  <li>
                    ✅ <strong className="text-white">Idea:</strong> July 2025
                  </li>
                  <li>
                    📅 <strong className="text-white">MVP:</strong> September
                    2025
                  </li>
                  <li>
                    🌍 <strong className="text-white">Launched:</strong>{" "}
                    November 2025
                  </li>
                </ul>
              </section>

              {/* 5. Implementation */}
              <section className="text-slate-200 pb-20">
                <h2 className="text-2xl font-bold text-cyan-400 mb-4">
                  4. Implementation Plan
                </h2>
                <p>
                  We leverage{" "}
                  <strong className="text-white">Whisper API</strong> for
                  high-accuracy speech-to-text and{" "}
                  <strong className="text-white">Gemini AI</strong> for
                  intelligent summarization. Our architecture utilizes{" "}
                  <strong className="text-white">Vercel Edge</strong> for global
                  low-latency performance.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
      
      <div
        style={{
          padding: "40px",
          lineHeight: "1.6",
          maxWidth: "1000px",
          margin: "0 auto",
        }}
      >
        <hr />
      </div>
      {/* Footer */}
      <footer className="relative z-20 py-6 px-4 text-center border-t border-white/5 bg-slate-950/80 backdrop-blur-md">
        <p className="text-slate-500 text-sm">
          {locale === "ru"
            ? "© 2026 СумМит. Все права защищены."
            : "© 2026 SumMeet. All rights reserved."}
        </p>
      </footer>
    </main>
  );
}
