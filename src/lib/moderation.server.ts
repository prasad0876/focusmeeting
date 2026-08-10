/** Server-only abuse detection + enforcement shared by chat and speech moderation. */

const GATEWAY = "https://ai.gateway.lovable.dev/v1";

export type AbuseSeverity = "none" | "low" | "moderate" | "high" | "severe";

export type ModerationResult = {
  severity: AbuseSeverity;
  categories: string[];
  reasoning: string;
};

const SYSTEM_PROMPT = `You are a real-time content moderator for a professional video conferencing platform.
You receive either a typed chat message or a speech-to-text transcript of what a participant said out loud.
Classify it for abusive content. Respond ONLY with strict JSON matching:
{"severity":"none|low|moderate|high|severe","categories":["..."],"reasoning":"short"}.

Severity rubric:
- none: normal, professional or casual conversation.
- low: mild rudeness, sarcasm, light profanity or swear words not aimed at anyone.
- moderate: insults, targeted profanity, name-calling, disrespectful tone.
- high: harassment, hate speech, slurs, sexual content, personal attacks.
- severe: threats of violence, doxxing, incitement, extreme hate, repeated slurs.

Any profanity or swear word is at least "low" — never classify profanity as "none".
Transcripts may be imperfect; judge the obvious intent.

Categories may include: hate_speech, harassment, personal_attack, offensive_language, profanity, threat, sexual, spam.`;

export function actionForSeverity(severity: AbuseSeverity) {
  switch (severity) {
    case "low": return "warning";
    case "moderate": return "temporary_mute";
    case "high": return "notify_host";
    case "severe": return "auto_remove";
    default: return "none";
  }
}

export function reputationDelta(severity: AbuseSeverity) {
  switch (severity) {
    case "low": return -1;
    case "moderate": return -5;
    case "high": return -15;
    case "severe": return -40;
    default: return 0;
  }
}

/** Fast deterministic backstop so obvious profanity is never missed if the model is unavailable. */
const PROFANITY = [
  "fuck", "fucking", "fucker", "motherfucker", "shit", "bullshit", "bitch", "bastard",
  "asshole", "dickhead", "cunt", "slut", "whore", "retard", "nigger", "faggot",
  "rape", "kill you", "kill yourself",
];

export function heuristicSeverity(text: string): AbuseSeverity {
  const t = text.toLowerCase();
  if (/\b(kill you|kill yourself|nigger|faggot|rape)\b/.test(t)) return "severe";
  const hit = PROFANITY.some((w) => new RegExp(`\\b${w}\\b`, "i").test(t));
  if (!hit) return "none";
  if (/\b(you|u|your|ur)\b/.test(t)) return "moderate";
  return "low";
}

const ORDER: AbuseSeverity[] = ["none", "low", "moderate", "high", "severe"];
function maxSeverity(a: AbuseSeverity, b: AbuseSeverity): AbuseSeverity {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}

export async function classifyAbuse(content: string): Promise<ModerationResult> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  let mod: ModerationResult = { severity: "none", categories: [], reasoning: "no-ai" };

  if (apiKey) {
    try {
      const res = await fetch(`${GATEWAY}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (res.ok) {
        const json: any = await res.json();
        const text: string = json?.choices?.[0]?.message?.content ?? "";
        try {
          const parsed = JSON.parse(text);
          mod = {
            severity: (parsed.severity ?? "none") as AbuseSeverity,
            categories: Array.isArray(parsed.categories) ? parsed.categories : [],
            reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
          };
        } catch {
          console.error("[moderation] unparsable model output", text.slice(0, 200));
        }
      } else {
        console.error("[moderation] gateway", res.status, await res.text().catch(() => ""));
      }
    } catch (err) {
      console.error("[moderation]", err);
    }
  }

  // Deterministic backstop
  const heur = heuristicSeverity(content);
  if (heur !== "none") {
    const merged = maxSeverity(mod.severity, heur);
    if (merged !== mod.severity) {
      mod = {
        severity: merged,
        categories: mod.categories.length ? mod.categories : ["profanity"],
        reasoning: mod.reasoning || "profanity detected",
      };
    }
  }
  return mod;
}

type EnforceArgs = {
  supabase: any;
  userId: string;
  meetingId: string;
  content: string;
  mod: ModerationResult;
  messageId?: string | null;
  source: "chat" | "speech";
};

/** Log the incident, apply mute/removal, and adjust reputation. */
export async function enforceAbuse({
  supabase,
  userId,
  meetingId,
  content,
  mod,
  messageId,
  source,
}: EnforceArgs) {
  const severity = mod.severity;
  if (severity === "none") return { action: "none" as const };

  const action = actionForSeverity(severity);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  await supabase.from("abuse_incidents").insert({
    meeting_id: meetingId,
    user_id: userId,
    message_id: messageId ?? null,
    severity,
    category: [source === "speech" ? "spoken" : "chat", ...mod.categories].join(",") || "general",
    excerpt: content.slice(0, 200),
    action_taken: action,
  });

  if (severity === "moderate" || severity === "high") {
    await supabaseAdmin
      .from("meeting_participants")
      .update({ is_muted: true })
      .eq("meeting_id", meetingId)
      .eq("user_id", userId);
  }
  if (severity === "severe") {
    await supabaseAdmin
      .from("meeting_participants")
      .update({ is_removed: true, left_at: new Date().toISOString() })
      .eq("meeting_id", meetingId)
      .eq("user_id", userId);
  }

  const delta = reputationDelta(severity);
  if (delta !== 0) {
    const { data: prof } = await supabase
      .from("profiles")
      .select("reputation")
      .eq("id", userId)
      .maybeSingle();
    const next = Math.max(0, Math.min(100, (prof?.reputation ?? 100) + delta));
    await supabaseAdmin
      .from("profiles")
      .update({ reputation: next, is_blacklisted: next <= 10 })
      .eq("id", userId);
  }

  return { action };
}
