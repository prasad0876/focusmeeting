import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

// ---------- Transcribe an audio chunk ----------
const TranscribeInput = z.object({
  meetingId: z.string().uuid(),
  // base64-encoded audio (webm or mp4) ~ up to ~2MB encoded
  audioBase64: z.string().min(40).max(3_500_000),
  mimeType: z.string().min(3).max(80),
  startedAtMs: z.number().int().min(0),
  endedAtMs: z.number().int().min(0),
});

export const transcribeMeetingChunk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => TranscribeInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) return { text: "", inserted: false };

    // Decode base64 → Uint8Array
    const bin = Uint8Array.from(atob(data.audioBase64), (c) => c.charCodeAt(0));
    const ext =
      data.mimeType.includes("mp4") ? "mp4" :
      data.mimeType.includes("mpeg") ? "mp3" :
      data.mimeType.includes("wav") ? "wav" : "webm";
    const blob = new Blob([bin], { type: data.mimeType });

    const form = new FormData();
    form.append("model", "openai/gpt-4o-mini-transcribe");
    form.append("file", blob, `chunk.${ext}`);

    let text = "";
    try {
      const res = await fetch(`${GATEWAY}/audio/transcriptions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
      if (!res.ok) {
        console.error("[stt]", res.status, await res.text().catch(() => ""));
        return { text: "", inserted: false };
      }
      const json = await res.json();
      text = (json?.text ?? "").trim();
    } catch (err) {
      console.error("[stt] fetch", err);
      return { text: "", inserted: false };
    }

    if (!text || text.length < 2) return { text: "", inserted: false, severity: "none" as const };

    // Get speaker name
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, handle")
      .eq("id", userId)
      .single();

    const { error: insErr } = await supabase.from("meeting_transcripts").insert({
      meeting_id: data.meetingId,
      user_id: userId,
      speaker_name: prof?.display_name ?? prof?.handle ?? "Participant",
      content: text,
      started_at_ms: data.startedAtMs,
      ended_at_ms: data.endedAtMs,
    });
    if (insErr) console.error("[stt] insert", insErr);

    // Spoken-abuse detection on the same transcript.
    let severity: "none" | "low" | "moderate" | "high" | "severe" = "none";
    try {
      const { classifyAbuse, enforceAbuse } = await import("@/lib/moderation.server");
      const mod = await classifyAbuse(text);
      severity = mod.severity;
      await enforceAbuse({
        supabase,
        userId,
        meetingId: data.meetingId,
        content: text,
        mod,
        source: "speech",
      });
    } catch (err) {
      console.error("[stt] moderation", err);
    }

    return { text, inserted: !insErr, severity };
  });


// ---------- Generate post-meeting summary + action items ----------
const SummaryInput = z.object({ meetingId: z.string().uuid() });

const SUMMARY_PROMPT = `You are an executive meeting assistant.
Given a chronological transcript with speaker names and timestamps,
produce STRICT JSON matching:
{
  "title": "short topic of the meeting",
  "summary": "2-4 short paragraphs covering what was discussed",
  "topics": ["main topic 1", "main topic 2", ...],
  "decisions": ["final decision 1", ...],
  "chapters": [{"label":"Introduction","timestamp_ms":0}, ...],
  "action_items": [{"assignee":"Name","task":"what to do","deadline":"Friday or null","timestamp_ms":12345}]
}
Be concise. If the transcript is empty or trivial, still return the shape with sensible empty arrays.`;

export const generateMeetingSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SummaryInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Authorize: only host
    const { data: meeting } = await supabase
      .from("meetings")
      .select("id, title, host_id, created_at, ended_at")
      .eq("id", data.meetingId)
      .single();
    if (!meeting) throw new Error("Meeting not found");
    if (meeting.host_id !== userId) throw new Error("Only the host can generate the summary");

    const { data: segments } = await supabase
      .from("meeting_transcripts")
      .select("speaker_name, content, started_at_ms")
      .eq("meeting_id", data.meetingId)
      .order("started_at_ms", { ascending: true })
      .limit(2000);

    const transcriptText = (segments ?? [])
      .map((s) => `[${fmtMs(s.started_at_ms)}] ${s.speaker_name}: ${s.content}`)
      .join("\n");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SUMMARY_PROMPT },
          { role: "user", content: `Meeting title: ${meeting.title}\n\nTranscript:\n${transcriptText || "(no speech captured)"}` },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (res.status === 429) throw new Error("Rate limited — try again in a moment");
    if (res.status === 402) throw new Error("AI credits exhausted");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const json = await res.json();
    let parsed: any = {};
    try {
      parsed = JSON.parse(json?.choices?.[0]?.message?.content ?? "{}");
    } catch {
      parsed = {};
    }

    const duration = computeDuration(segments ?? [], meeting.created_at, meeting.ended_at);

    await supabase.from("meeting_summaries").upsert(
      {
        meeting_id: data.meetingId,
        title: parsed.title ?? meeting.title,
        summary: parsed.summary ?? "No summary available.",
        topics: parsed.topics ?? [],
        decisions: parsed.decisions ?? [],
        chapters: parsed.chapters ?? [],
        duration_seconds: duration,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "meeting_id" },
    );

    // Replace action items
    await supabase.from("meeting_action_items").delete().eq("meeting_id", data.meetingId);
    const actions = Array.isArray(parsed.action_items) ? parsed.action_items : [];
    if (actions.length > 0) {
      await supabase.from("meeting_action_items").insert(
        actions.slice(0, 50).map((a: any) => ({
          meeting_id: data.meetingId,
          assignee_name: String(a.assignee ?? "Unassigned").slice(0, 80),
          task: String(a.task ?? "").slice(0, 500),
          deadline: a.deadline ? String(a.deadline).slice(0, 80) : null,
          source_timestamp_ms: Number.isFinite(a.timestamp_ms) ? Math.floor(a.timestamp_ms) : null,
        })),
      );
    }

    return { ok: true };
  });

// ---------- Answer a question about the meeting ----------
const AskInput = z.object({
  meetingId: z.string().uuid(),
  question: z.string().min(2).max(500),
});

export const askMeetingMemory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => AskInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: segments } = await supabase
      .from("meeting_transcripts")
      .select("speaker_name, content, started_at_ms")
      .eq("meeting_id", data.meetingId)
      .order("started_at_ms", { ascending: true })
      .limit(2000);

    const ctx = (segments ?? [])
      .map((s) => `[${fmtMs(s.started_at_ms)}] ${s.speaker_name}: ${s.content}`)
      .join("\n");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI not configured");
    const res = await fetch(`${GATEWAY}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          {
            role: "system",
            content:
              "You answer questions strictly using the meeting transcript provided. Quote timestamps like [12:34] when relevant. If the answer is not in the transcript, say so honestly.",
          },
          { role: "user", content: `Transcript:\n${ctx || "(empty)"}\n\nQuestion: ${data.question}` },
        ],
      }),
    });
    if (res.status === 429) throw new Error("Rate limited");
    if (res.status === 402) throw new Error("AI credits exhausted");
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const json = await res.json();
    return { answer: (json?.choices?.[0]?.message?.content ?? "").trim() || "No answer." };
  });

function fmtMs(ms: number) {
  const s = Math.floor((ms ?? 0) / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function computeDuration(segments: { started_at_ms: number }[], createdAt: string, endedAt: string | null) {
  if (endedAt) {
    return Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(createdAt).getTime()) / 1000));
  }
  if (segments.length > 0) return Math.floor(segments[segments.length - 1].started_at_ms / 1000);
  return 0;
}
