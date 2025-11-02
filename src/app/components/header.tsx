"use client";

import { signIn, signOut, useSession } from "next-auth/react";

export default function Header() {
  const { data: session, status } = useSession();
  const loading = status === "loading";

  return (
    <header className="font-sans flex justify-between items-center w-full px-6">
      <div></div>

      <nav className="flex rounded-xl items-center justify-center text-center w-96 border-4 border-black p-1 justify-self-center self-center">
        <h1 className="uppercase text-black text-center font-bold">shadmanov</h1>
      </nav>

      <div className="flex justify-end gap-2">
        {loading ? (
          <p>Loading...</p>
        ) : !session ? (
          // If user not signed in
          <>
            <button
              onClick={() => signIn("google")}
              className="bg-gray-200 text-black rounded-full font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 cursor-pointer"
            >
              Sign In with Google
            </button>
            <button
              onClick={() => signIn("github")}
              className="bg-[#6c47ff] text-white rounded-full font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 cursor-pointer"
            >
              Sign Up with GitHub
            </button>
          </>
        ) : (
          // If user signed in
          <div className="flex items-center gap-3">
            {session.user?.image && (
              <img
                src={session.user.image}
                alt="user avatar"
                className="w-10 h-10 rounded-full border border-gray-400"
              />
            )}
            <span className="text-sm font-medium">{session.user?.name}</span>
            <button
              onClick={() => signOut()}
              className="bg-red-500 text-white rounded-full font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
