"use client";

import { signIn, signOut, useSession } from "next-auth/react";
import React from "react";

export default function Home() {
  const { data: session } = useSession();

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-900 via-gray-900 to-purple-900">
      <div className="text-center px-4">
        <h1 className="text-5xl md:text-6xl font-bold text-white mb-4">
          Welcome to Shadmanov
        </h1>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Chat with anyone without getting lost. Sign in to get started or
          create a new account.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          {!session ? (
            <>
              <button
                onClick={() => signIn("google")}
                className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 w-full sm:w-auto text-center"
              >
                Login with Google
              </button>
              <button
                onClick={() => signIn("github")}
                className="px-8 py-3 bg-gray-800 hover:bg-gray-900 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 w-full sm:w-auto text-center"
              >
                Login with GitHub
              </button>
            </>
          ) : (
            <>
              <a
                href="/schedule"
                className="px-8 py-3 bg-white hover:bg-gray-100 text-gray-900 font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 w-full sm:w-auto text-center"
              >
                Go to schedule
              </a>
              <button
                onClick={() => signOut()}
                className="px-8 py-3 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 w-full sm:w-auto text-center"
              >
                Sign Out
              </button>
            </>
          )}
        </div>

        <div className="mt-12 text-gray-400 text-sm">
          <p>Need help? Contact support</p>
        </div>
      </div>
      <footer className="fixed select-none bottom-0 right-0 text-gray-400">
        <p>
          @ 2025 Shadmanov. All Rights Reserved.
        </p>
      </footer>
    </main>
  );
}
