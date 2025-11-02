// src/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb";

export const authOptions: NextAuthOptions = {
  adapter: MongoDBAdapter(clientPromise),

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    }),
  ],

  session: {
    strategy: "jwt",
  },

  pages: {
    signIn: "/auth/signin",
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.id = (user as any).id;
      return token;
    },
    async session({ session, token }) {
      if (token) session.user.id = token.id as string;
      return session;
    },
  },

  secret: process.env.NEXTAUTH_SECRET,
};

// ✅ Universal helper for both API routes and server components
export async function auth(req?: Request) {
  try {
    if (req) {
      const cookieHeader = req.headers.get("cookie");
      if (!cookieHeader) return { userId: null, user: null };

      const mockReq = {
        headers: { cookie: cookieHeader },
        cookies: Object.fromEntries(
          cookieHeader
            .split(";")
            .map(c => c.trim().split("="))
            .filter(([key]) => key)
        ),
      };

      const token = await getToken({
        req: mockReq as any,
        secret: process.env.NEXTAUTH_SECRET,
      });

      if (token?.id || token?.sub) {
        const userId = token.id || token.sub;
        return { userId: userId as string, user: token };
      }

      return { userId: null, user: null };
    }

    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      return { userId: session.user.id, user: session.user };
    }

    return { userId: null, user: null };
  } catch (err) {
    console.error("Auth error:", err);
    return { userId: null, user: null };
  }
}
