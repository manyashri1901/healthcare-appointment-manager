import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exchangeCodeForTokens, saveGoogleTokens } from "@/lib/google";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  const dashboardPath = session.user.role === "DOCTOR" ? "/doctor" : "/patient";

  if (error || !code) {
    return NextResponse.redirect(new URL(`${dashboardPath}?google=error`, request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    await saveGoogleTokens(session.user.id, tokens);
    return NextResponse.redirect(new URL(`${dashboardPath}?google=connected`, request.url));
  } catch {
    return NextResponse.redirect(new URL(`${dashboardPath}?google=error`, request.url));
  }
}
