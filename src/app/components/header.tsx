"use client";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@clerk/nextjs";

export default function Header() {

  return (
    <header className="font-sans flex justify-between items-center w-full px-6">
      <div></div>
      <nav className="flex rounded-xl items-center justify-center text-center w-96 border-4 border-black p-1 justify-self-center self-center">
        <h1 className="uppercase text-black text-center font-bold">shadmanov</h1>
      </nav>
      <div className="flex justify-end gap-2">
      <SignedOut>
        <SignInButton />
        <SignUpButton>
          <button className="bg-[#6c47ff] text-white rounded-full font-medium text-sm sm:text-base h-10 sm:h-12 px-4 sm:px-5 cursor-pointer">
            Sign Up
          </button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
      </div>
    </header>
  );
}
