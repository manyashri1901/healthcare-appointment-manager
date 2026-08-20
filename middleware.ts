import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";

const roleForPrefix: Record<string, string> = {
  "/admin": "ADMIN",
  "/doctor": "DOCTOR",
  "/patient": "PATIENT",
};

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const role = req.nextauth.token?.role as string | undefined;

    const prefix = Object.keys(roleForPrefix).find((p) => pathname.startsWith(p));
    if (prefix && role !== roleForPrefix[prefix]) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: ["/admin/:path*", "/doctor/:path*", "/patient/:path*"],
};
