import { NextRequest, NextResponse } from "next/server";

const protectedRoutes = ["/dashboard", "/settings", "/chat", "/chats"];
const publicRoutes = ["/login", "/register"];

function isProtectedRoute(pathname: string) {
  return protectedRoutes.some((route) => pathname.startsWith(route));
}

function isPublicRoute(pathname: string) {
  return publicRoutes.some((route) => pathname.startsWith(route));
}

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith("/api/uploadthing")) {
    return NextResponse.next();
  }

  let session: { user?: unknown } | null = null;
  try {
    const response = await fetch(new URL("/api/auth/get-session", request.nextUrl.origin), {
      headers: {
        cookie: request.headers.get("cookie") ?? ""
      }
    });
    if (response.ok) {
      session = await response.json();
    }
  } catch {
    session = null;
  }
  const pathname = request.nextUrl.pathname;

  if (isPublicRoute(pathname) && session?.user) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isProtectedRoute(pathname) && !session?.user) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/settings/:path*",
    "/chat/:path*",
    "/chats/:path*",
    "/login",
    "/register",
  ],
};
