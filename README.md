# Healthcare Appointment & Follow-up Manager

A full-stack clinic platform with separate portals for patients, doctors, and admins.
Patients book appointments and submit symptoms in advance; an LLM generates a
pre-visit summary with urgency level for the doctor and a patient-friendly
summary after the visit. Both sides get email and Google Calendar updates on
booking, reschedule, and cancellation.

**Live demo:** TODO — add your Vercel URL here once deployed
**Demo credentials:** TODO — add seeded admin/doctor/patient login details here

## Tech Stack

- Next.js 14 (App Router, TypeScript)
- PostgreSQL + Prisma
- NextAuth.js (credentials + JWT, role-based)
- Nodemailer (SMTP)
- Google Calendar API (OAuth 2.0)
- Pluggable LLM module (OpenAI / Anthropic / mock fallback)

## Setup

1. Clone the repo and install dependencies:
   \`\`\`bash
   git clone https://github.com/<you>/healthcare-appointment-manager.git
   cd healthcare-appointment-manager
   npm install
   \`\`\`
2. Copy `.env.example` to `.env` and fill in real values (see comments in that file).
3. Run the database migration:
   \`\`\`bash
   npx prisma migrate dev
   \`\`\`
4. (Optional) Seed demo data:
   \`\`\`bash
   npm run seed
   \`\`\`
5. Start the dev server:
   \`\`\`bash
   npm run dev
   \`\`\`
   Open http://localhost:3000

## Database Schema

TODO — brief walkthrough of the models once the schema is finalized (User, DoctorProfile,
DoctorLeave, SlotHold, Appointment, SymptomForm, PreVisitSummary, PostVisitNote,
PostVisitSummary, Prescription, MedicationReminder, NotificationLog). See `prisma/schema.prisma`
for the full source of truth.

## API Documentation

TODO — table of endpoints (method, path, role, purpose) as they're built. See the
spec for the full planned contract.

## LLM Prompts

**Pre-visit summary:**
> Analyse these symptoms and return: urgency level (Low / Medium / High), chief
> complaint, and three suggested questions for the doctor. Symptoms: `<symptoms>`

**Post-visit summary:**
> Convert these clinical notes into a patient-friendly summary with medication
> schedule and follow-up steps: `<notes>`

If `LLM_PROVIDER` has no valid key configured, or the call fails/times out, the system
falls back to a safe, clearly-labeled default rather than breaking the booking flow.

## Google Calendar Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) → create a project.
2. Enable the **Google Calendar API**.
3. Configure the OAuth consent screen (External, Testing mode is fine for a demo).
4. Create an OAuth Client ID (Web application) with redirect URI matching `GOOGLE_REDIRECT_URI`
   in your `.env` (update this to your deployed URL once hosted).
5. Copy the Client ID and Secret into `.env`.

## System Design

See [`SYSTEM_DESIGN.md`](./SYSTEM_DESIGN.md) for the write-up covering double-booking
prevention, slot hold mechanism, doctor leave conflict handling, and notification
failure handling.

## Project Status

TODO — update as features land (e.g. "Core booking engine complete; Calendar
integration in progress").