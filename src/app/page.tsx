"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import React from "react";
import { useLocale } from "./components/provider/locale-provider";

export default function Home() {
  const { data: session } = useSession();
  const {locale} = useLocale();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-900 via-gray-900 to-purple-900">
      <div className="text-center px-4">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
          {locale === 'ru' ? 'Добро пожаловать в СумМит':'Welcome to SumMeet'}
        </h1>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          {locale === 'ru' ? 'Планируйте и управляйте своими встречами эффективно с помощью нашего удобного приложения. Войдите, чтобы начать!':'Plan and manage your meetings efficiently with our user-friendly app. Sign in to get started!'}
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {!session ? (
            <>
              <button
                onClick={() => signIn("google", {callbackUrl: "/schedule"})}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 w-full sm:w-auto text-center"
              >
                {locale === 'ru' ? 'Войти с помощью Google' : 'Login with Google'}
              </button>
              <button
                onClick={() => signIn("github",{callbackUrl: "/schedule"})}
                className="px-8 py-3 bg-gray-800 hover:bg-gray-900 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 w-full sm:w-auto text-center"
              >
                {locale === 'ru' ? 'Войти с помощью GitHub' : 'Login with GitHub'}
              </button>
            </>
          ) : (
            <>
              <a
                href="/schedule"
                className="px-8 py-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 w-full sm:w-auto text-center"
              >
                {locale === 'ru' ? 'Перейти к расписанию' : 'Go to Schedule'}
              </a>
              <button
                onClick={() => signOut()}
                className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 w-full sm:w-auto text-center"
              >
                {locale === 'ru' ? 'Выйти' : 'Sign Out'}
              </button>
            </>
          )}
        </div>

        <div className="mt-12 text-gray-400 text-sm">
          <p>
            {locale === 'ru' ? 'Нужен помощь? Свяжитесь с нами по адресу' : 'Need help? Contact us at '}{"SumMeetsupport@gmail.com"}
          </p>
        </div>
      </div>
      <footer className="fixed select-none bottom-0 right-0 text-gray-400">
        <p>
          {locale === 'ru' ? '© 2025 СумМит. Все права защищены.' : '© 2025 SumMeet. All rights reserved.'}
        </p>
      </footer>
    </main>
  );
}

