import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const isProtectedRoute = (request: NextRequest) => request.nextUrl.pathname.startsWith("/dashboard");

export const authMiddleware = async (request: NextRequest) => {
  const url = new URL("/api/auth/get-session", request.nextUrl.origin);
  const response = await fetch(url, {
    headers: {
      cookie: request.headers.get("cookie") ?? ""
    }
  });

  const session = await response.json();

  if (isProtectedRoute(request) && !session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
};
