"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";
import { LanguageToggle } from "../../components/language/language-toggle";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { Button } from "../../components/ui/button";
import { useSession, signIn, signOut } from "next-auth/react";
import React from "react";
import { useLocale } from "../../components/provider/locale-provider";

export default function Navbar() {
    const { data: session } = useSession();
    const { locale } = useLocale();
    const [mobileOpen, setMobileOpen] = useState(false);

    console.log("Navbar rendering");

    return (
        <nav className="w-full bg-gray-800">
            <div className="flex items-center justify-between px-6 py-4">
                <div className="text-white text-lg font-bold">
                    {locale === 'ru' ? 'СумМит' : 'SumMeet'}
                </div>

                {/* Desktop nav — hidden below md */}
                <div className="hidden md:flex items-center gap-4">
                    <LanguageToggle />
                    <a href="/meeting" className="text-sm text-white hover:text-slate-200 transition">
                        {locale === 'ru' ? 'Комнаты' : 'Rooms'}
                    </a>
                    <a href="/history" className="text-sm text-white hover:text-slate-200 transition">
                        {locale === 'ru' ? 'История' : 'History'}
                    </a>
                    {!session ? (
                        <Button variant="ghost" onClick={() => signIn()}>
                            {locale === 'ru' ? 'Войти' : 'Sign In'}
                        </Button>
                    ) : (
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button variant="ghost">
                                    {session?.user?.name}
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="bg-gray-700 text-white">
                                <DropdownMenuItem
                                    className="cursor-pointer hover:bg-gray-600"
                                    onClick={() => signOut()}
                                >
                                    {locale === 'ru' ? 'Выйти' : 'Sign Out'}
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    )}
                </div>

                {/* Mobile toggle — hidden at md and up */}
                <button
                    className="md:hidden text-white p-1"
                    onClick={() => setMobileOpen((v) => !v)}
                    aria-label={mobileOpen ? "Close menu" : "Open menu"}
                >
                    {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
                </button>
            </div>

           {/* Mobile dropdown panel */}
            {mobileOpen && (
                <div className="md:hidden flex flex-col gap-3 px-6 pb-4 border-t border-white/10 pt-4">
                    <LanguageToggle />
                    <a
                        href="/meeting"
                        className="text-sm text-white hover:text-slate-200 transition"
                        onClick={() => setMobileOpen(false)}
                    >
                        {locale === 'ru' ? 'Комнаты' : 'Rooms'}
                    </a>
                    <a
                        href="/history"
                        className="text-sm text-white hover:text-slate-200 transition"
                        onClick={() => setMobileOpen(false)}
                    >
                        {locale === 'ru' ? 'История' : 'History'}
                    </a>
                    {!session ? (
                        <Button variant="ghost" onClick={() => signIn()} className="w-full justify-start">
                            {locale === 'ru' ? 'Войти' : 'Sign In'}
                        </Button>
                    ) : (
                        <>
                            <span className="text-sm text-slate-300">{session?.user?.name}</span>
                            <Button variant="ghost" onClick={() => signOut()} className="w-full justify-start">
                                {locale === 'ru' ? 'Выйти' : 'Sign Out'}
                            </Button>
                        </>
                    )}
                </div>
            )}
        </nav>
    );
}