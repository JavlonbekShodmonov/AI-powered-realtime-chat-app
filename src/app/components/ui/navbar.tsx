"use client";

import { LanguageToggle } from "../../components/language/language-toggle";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,DropdownMenuItem } from "../../components/ui/dropdown-menu";
import { Button } from "../../components/ui/button";
import { useSession, signIn, signOut } from "next-auth/react";
import React from "react";
import { useLocale } from "../../components/provider/locale-provider";

export default function Navbar() {

    const {data: session} = useSession();
    const {locale} = useLocale();

    console.log("Navbar rendering");

    return (
        <nav 
            className="w-full flex items-center justify-between px-6 py-4 bg-gray-800"
            onClick={() => console.log("NAV CLICKED!")}
        >
            <div 
                className="text-white text-lg font-bold"
                onClick={() => console.log("LOGO CLICKED!")}
            >
                {locale === 'ru' ? 'СумМит' : 'SumMeet'}
            </div>
            <div className="flex items-center gap-4">
                <LanguageToggle />
                {!session ? (
                    <Button variant="ghost" onClick={() => signIn()}>
                        {locale === 'ru' ? 'Войти' : 'Sign In'}
                    </Button>
                ) : (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost">
                                {session.user?.name}
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
        </nav>
    );

}