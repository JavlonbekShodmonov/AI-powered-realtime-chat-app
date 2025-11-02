"use client";
import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <h1 className="text-2xl mb-4 font-bold">Sign In</h1>
      <button
        onClick={() => signIn("google")}
        className="bg-red-500 text-white px-4 py-2 rounded mb-2"
      >
        Sign in with Google
      </button>
      <button
        onClick={() => signIn("github")}
        className="bg-gray-800 text-white px-4 py-2 rounded"
      >
        Sign in with GitHub
      </button>
    </div>
  );
}
