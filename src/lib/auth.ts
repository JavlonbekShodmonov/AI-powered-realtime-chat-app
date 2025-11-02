// lib/auth.ts
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

// ✅ FIXED: Proper cookie parsing for App Router
export async function auth(req?: Request) {
  try {
    if (req) {
      // Parse cookies from Request headers
      const cookieHeader = req.headers.get("cookie");
      
      if (!cookieHeader) {
        console.warn("❌ No cookie header found");
        return { userId: null, user: null };
      }

      // Create a proper request object for getToken
      const mockReq = {
        headers: {
          cookie: cookieHeader,
        },
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
        console.log("✅ Auth success:", userId);
        return { userId: userId as string, user: token };
      }
      
      console.warn("❌ No valid token found");
      return { userId: null, user: null };
    }

    // Fallback to getServerSession
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      console.log("✅ Session success:", session.user.id);
      return { userId: session.user.id, user: session.user };
    }

    console.warn("❌ No session found");
    return { userId: null, user: null };
  } catch (err) {
    console.error("❌ Auth error:", err);
    return { userId: null, user: null };
  }
}