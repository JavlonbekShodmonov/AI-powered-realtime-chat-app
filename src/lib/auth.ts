// src/lib/auth.ts
import type { NextAuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import { getToken } from "next-auth/jwt";
import GoogleProvider from "next-auth/providers/google";
import GitHubProvider from "next-auth/providers/github";
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import clientPromise from "@/lib/mongodb";

type SessionUserWithId = {
  id?: string;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

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
    signIn: "/", // ✅ Changed to match your actual sign-in page
  },

  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.name = user.name; // ← add this
        token.email = user.email; // ← add this too while you're here
      }
      return token;
    },
    async session({ session, token }) {
      if (token && session.user) {
        const user = session.user as SessionUserWithId;
        user.id = token.id as string;
        user.name = token.name as string; // ← add this
        user.email = token.email as string; // ← add this too
      }
      return session;
    },
    // redirect stays the same...

    // ✅ Add this callback to redirect after sign-in
    async redirect({ url, baseUrl }) {
      // If signing in, redirect to the plugin dashboard
      if (url === baseUrl || url === `${baseUrl}/`) {
        return `${baseUrl}/meeting`;
      }
      // Allow relative callback URLs
      if (url.startsWith("/")) return `${baseUrl}${url}`;
      // Allow callback URLs on the same origin
      if (new URL(url).origin === baseUrl) return url;
      return baseUrl;
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
            .map((c) => c.trim().split("="))
            .filter(([key]) => key),
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
    if (session?.user && (session.user as SessionUserWithId).id) {
      return { userId: (session.user as SessionUserWithId).id, user: session.user };
    }

    return { userId: null, user: null };
  } catch (err) {
    console.error("Auth error:", err);
    return { userId: null, user: null };
  }
}
