import { z } from "zod";

const TIMEOUT_MS = 15_000;

export type UrgencyLevel = "LOW" | "MEDIUM" | "HIGH";
export type SummaryStatus = "SUCCESS" | "FALLBACK";

export interface PreVisitResult {
  urgencyLevel: UrgencyLevel;
  chiefComplaint: string;
  suggestedQuestions: string[];
  status: SummaryStatus;
}

export interface PostVisitResult {
  summary: string;
  status: SummaryStatus;
}

const preVisitSchema = z.object({
  urgencyLevel: z.enum(["Low", "Medium", "High", "LOW", "MEDIUM", "HIGH"]),
  chiefComplaint: z.string().min(1),
  suggestedQuestions: z.array(z.string()).min(1),
});

const postVisitSchema = z.object({
  summary: z.string().min(1),
});

async function callProvider(prompt: string): Promise<string> {
  const provider = (process.env.LLM_PROVIDER ?? "mock").toLowerCase();

  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");
    return callOpenAI(prompt);
  }

  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY not set");
    return callAnthropic(prompt);
  }

  throw new Error("LLM_PROVIDER is mock or unset");
}

async function callOpenAI(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "You always respond with strict, valid JSON and nothing else." },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`OpenAI request failed: ${res.status}`);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("Unexpected OpenAI response shape");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

async function callAnthropic(prompt: string): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        system: "You always respond with strict, valid JSON and nothing else — no markdown fences, no commentary.",
        messages: [{ role: "user", content: prompt }],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Anthropic request failed: ${res.status}`);
    }

    const data = await res.json();
    const content = data.content?.[0]?.text;
    if (typeof content !== "string") throw new Error("Unexpected Anthropic response shape");
    return content;
  } finally {
    clearTimeout(timeout);
  }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  return JSON.parse(candidate);
}

function normalizeUrgency(value: string): UrgencyLevel {
  const upper = value.toUpperCase();
  if (upper === "LOW" || upper === "MEDIUM" || upper === "HIGH") return upper;
  return "MEDIUM";
}

function mockPreVisitResult(symptoms: string): PreVisitResult {
  const lower = symptoms.toLowerCase();
  const highUrgencyKeywords = ["chest pain", "difficulty breathing", "severe", "unconscious", "bleeding heavily"];
  const urgencyLevel: UrgencyLevel = highUrgencyKeywords.some((k) => lower.includes(k)) ? "HIGH" : "MEDIUM";

  return {
    urgencyLevel,
    chiefComplaint: symptoms.slice(0, 140).trim() || "Not specified",
    suggestedQuestions: [
      "When did these symptoms first start?",
      "Have the symptoms gotten better, worse, or stayed the same?",
      "Are you currently taking any medications for this?",
    ],
    status: "FALLBACK",
  };
}

function mockPostVisitResult(notes: string): PostVisitResult {
  return {
    summary: `Here is a plain-language summary of your visit:\n\n${notes.slice(0, 400).trim()}\n\nPlease follow your doctor's instructions and contact the clinic if symptoms worsen.`,
    status: "FALLBACK",
  };
}

/** Analyses symptoms and returns an urgency level, chief complaint, and suggested questions. Never throws. */
export async function analyzeSymptoms(symptoms: string): Promise<PreVisitResult> {
  const prompt = `Analyse these symptoms and return: urgency level (Low / Medium / High), chief complaint, and three suggested questions for the doctor. Symptoms: ${symptoms}

Respond with strict JSON only, matching this shape exactly:
{"urgencyLevel": "Low" | "Medium" | "High", "chiefComplaint": string, "suggestedQuestions": [string, string, string]}`;

  try {
    const raw = await callProvider(prompt);
    const parsed = preVisitSchema.parse(extractJson(raw));
    return {
      urgencyLevel: normalizeUrgency(parsed.urgencyLevel),
      chiefComplaint: parsed.chiefComplaint,
      suggestedQuestions: parsed.suggestedQuestions.slice(0, 3),
      status: "SUCCESS",
    };
  } catch {
    return mockPreVisitResult(symptoms);
  }
}

/** Converts clinical notes into a patient-friendly summary. Never throws. */
export async function summarizePostVisit(notes: string): Promise<PostVisitResult> {
  const prompt = `Convert these clinical notes into a patient-friendly summary with medication schedule and follow-up steps: ${notes}

Respond with strict JSON only, matching this shape exactly:
{"summary": string}`;

  try {
    const raw = await callProvider(prompt);
    const parsed = postVisitSchema.parse(extractJson(raw));
    return { summary: parsed.summary, status: "SUCCESS" };
  } catch {
    return mockPostVisitResult(notes);
  }
}
