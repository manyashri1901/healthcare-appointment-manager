import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import crypto from "node:crypto";
import { authOptions } from "@/lib/auth";
import { getGoogleAuthUrl } from "@/lib/google";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A random state value is enough to satisfy Google's OAuth flow here — the
  // callback re-derives the identity to attach tokens to from the session
  // cookie, not from the state, so there's no server-side state store to check it against.
  const state = crypto.randomBytes(16).toString("hex");
  return NextResponse.redirect(getGoogleAuthUrl(state));
}
