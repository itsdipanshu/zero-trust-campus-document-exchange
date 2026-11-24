import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Middleware for route protection
export function middleware(request: NextRequest) {
  const token = request.cookies.get("campusvault_token")?.value;
  const { pathname } = request.nextUrl;

  // Public routes
  const publicPaths = ["/", "/login", "/register"];
  const isPublicPath = publicPaths.includes(pathname);
  const isApiAuth = pathname.startsWith("/api/auth/login") || pathname.startsWith("/api/auth/register");
  const isApiPath = pathname.startsWith("/api/");

  // Allow public paths and auth API endpoints
  if (isPublicPath || isApiAuth) {
    // If user is authenticated and trying to access login/register, redirect to dashboard
    if (token && (pathname === "/login" || pathname === "/register")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  // Allow API routes to handle their own auth
  if (isApiPath) {
    return NextResponse.next();
  }

  // Protected routes - redirect to login if no token
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
