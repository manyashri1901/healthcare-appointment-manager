import { prisma } from "@/lib/prisma";
import { decrypt, encrypt } from "@/lib/crypto";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

export interface CalendarEventInput {
  summary: string;
  description?: string;
  startTime: Date;
  endTime: Date;
  attendeeEmails?: string[];
}

export function getGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
    response_type: "code",
    access_type: "offline",
    prompt: "consent",
    scope: "https://www.googleapis.com/auth/calendar.events",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI!,
      grant_type: "authorization_code",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Google token refresh failed: ${res.status} ${await res.text()}`);
  }

  return res.json();
}

export async function saveGoogleTokens(userId: string, tokens: TokenResponse): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000);

  await prisma.googleAccount.upsert({
    where: { userId },
    update: {
      accessTokenEncrypted: encrypt(tokens.access_token),
      ...(tokens.refresh_token ? { refreshTokenEncrypted: encrypt(tokens.refresh_token) } : {}),
      expiresAt,
    },
    create: {
      userId,
      accessTokenEncrypted: encrypt(tokens.access_token),
      refreshTokenEncrypted: encrypt(tokens.refresh_token ?? ""),
      expiresAt,
    },
  });
}

/** Returns a valid access token for the user, refreshing it if needed. Returns null if the user hasn't connected Google Calendar. */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.googleAccount.findUnique({ where: { userId } });
  if (!account) return null;

  if (account.expiresAt.getTime() - Date.now() > 60_000) {
    return decrypt(account.accessTokenEncrypted);
  }

  const refreshToken = decrypt(account.refreshTokenEncrypted);
  const tokens = await refreshAccessToken(refreshToken);
  await saveGoogleTokens(userId, tokens);
  return tokens.access_token;
}

function toRfc3339(date: Date): string {
  return date.toISOString();
}

/** Creates a calendar event for the user. Returns null if the user has not connected Google Calendar (not an error). */
export async function createCalendarEvent(userId: string, event: CalendarEventInput): Promise<string | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const res = await fetch(`${CALENDAR_EVENTS_URL}?sendUpdates=none`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: toRfc3339(event.startTime) },
      end: { dateTime: toRfc3339(event.endTime) },
      attendees: event.attendeeEmails?.map((email) => ({ email })),
    }),
  });

  if (!res.ok) {
    throw new Error(`Google Calendar event create failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.id as string;
}

export async function updateCalendarEvent(userId: string, eventId: string, event: CalendarEventInput): Promise<void> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;

  const res = await fetch(`${CALENDAR_EVENTS_URL}/${eventId}?sendUpdates=none`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: event.summary,
      description: event.description,
      start: { dateTime: toRfc3339(event.startTime) },
      end: { dateTime: toRfc3339(event.endTime) },
    }),
  });

  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar event update failed: ${res.status} ${await res.text()}`);
  }
}

export async function deleteCalendarEvent(userId: string, eventId: string): Promise<void> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return;

  const res = await fetch(`${CALENDAR_EVENTS_URL}/${eventId}?sendUpdates=none`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  // 404/410 means it's already gone — treat as success.
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`Google Calendar event delete failed: ${res.status} ${await res.text()}`);
  }
}
