# Friendly error messages for blocked updates

When the database blocks an action (permission rules, protected columns like grades, status, moderation flags), several screens still show raw technical text from Postgres. This makes it look broken and leaks internal details like table, trigger, and column names.

## What changes

1. Extend the shared error translator (`src/lib/errors.ts`) so database guard rejections map to plain-language messages, e.g.:
   - protected profile fields (status, reputation, department) → "Only an administrator can change this."
   - grade/score fields on submissions → "Only faculty can change grades or feedback."
   - moderation flags (mute/remove) on participants → "Only the meeting host or an admin can change this."
   - generic permission / row-level rejections → "You don't have permission to perform this action."
   - anything unrecognized and technical-looking (mentions of triggers, functions, schemas, SQLSTATE codes, stack text) → a safe generic fallback instead of the raw text.
2. Route every remaining screen's error toasts through that translator instead of printing `error.message` directly: invitations, attendance, gradebook, assessments, meeting room, meeting memory, whiteboard, new meeting, auth.
3. Keep successful flows and current behaviour untouched — only the message shown changes.

## Technical notes

- No database or policy changes; guards and RLS stay exactly as they are.
- `friendlyError()` gains pattern matching on guard/trigger messages plus a hardening step that suppresses raw messages containing internal identifiers (`private.`, `_guard_`, `pg_`, `SQLSTATE`, `relation`, quoted column lists) before falling back to a generic message.
- Files touched: `src/lib/errors.ts`, `src/routes/_authenticated/{invitations,attendance,gradebook,assessments,meeting.$id,memory.$id,new-meeting}.tsx`, `src/routes/auth.tsx`, `src/components/Whiteboard.tsx`.
