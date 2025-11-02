// middleware.ts
import { NextResponse, NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// ✅ FIXED: Use NextAuth JWT verification only (remove duplicate JWT logic)
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Allow public routes
  const publicPaths = [
    "/",
    "/schedule",
    "/auth/signin",
    "/api/auth",
  ];

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Use NextAuth's getToken to verify session
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    console.warn("❌ No auth token, redirecting to /");
    return NextResponse.redirect(new URL("/", req.url));
  }

  console.log("✅ Middleware passed for user:", token.id);
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Protect all routes except static files and API auth
    "/((?!_next/static|_next/image|favicon.ico|api/auth).*)",
  ],
};