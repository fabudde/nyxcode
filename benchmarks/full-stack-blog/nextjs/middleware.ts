// middleware.ts — rate limiting for auth endpoints
import { NextRequest, NextResponse } from "next/server";

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith("/api/auth")) {
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxRequests = 20;

    const entry = rateLimitMap.get(ip);
    if (entry && now < entry.resetTime) {
      if (entry.count >= maxRequests) {
        return NextResponse.json(
          { error: "Too many attempts, try again later" },
          { status: 429 }
        );
      }
      entry.count++;
    } else {
      rateLimitMap.set(ip, { count: 1, resetTime: now + windowMs });
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
