import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ModerateInput = z.object({
  meetingId: z.string().uuid(),
  content: z.string().min(1).max(2000),
});

type ModerationResult = {
  severity: "none" | "low" | "moderate" | "high" | "severe";
  categories: string[];
  reasoning: string;
};

const SYSTEM_PROMPT = `You are a real-time content moderator for a professional video conferencing platform.
Classify the user's chat message for abusive content. Respond ONLY with strict JSON matching:
{"severity":"none|low|moderate|high|severe","categories":["..."],"reasoning":"short"}.

Severity rubric:
- none: normal, professional or casual conversation.
- low: mild rudeness, sarcasm, light profanity not aimed at anyone.
- moderate: insults, targeted profanity, disrespectful tone.
- high: harassment, hate speech, slurs, sexual content, personal attacks.
- severe: threats of violence, doxxing, incitement, extreme hate, repeated slurs.

Categories may include: hate_speech, harassment, personal_attack, offensive_language, threat, sexual, spam.`;

function actionForSeverity(severity: ModerationResult["severity"]) {
  switch (severity) {
    case "low": return "warning";
    case "moderate": return "temporary_mute";
    case "high": return "notify_host";
    case "severe": return "auto_remove";
    default: return "none";
  }
}

function reputationDelta(severity: ModerationResult["severity"]) {
  switch (severity) {
    case "low": return -1;
    case "moderate": return -5;
    case "high": return -15;
    case "severe": return -40;
    default: return 0;
  }
}

export const moderateAndSendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ModerateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;

    let mod: ModerationResult = { severity: "none", categories: [], reasoning: "no-ai" };
    if (apiKey) {
      try {
        const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Lovable-API-Key": apiKey,
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: SYSTEM_PROMPT },
              { role: "user", content: data.content },
            ],
            response_format: { type: "json_object" },
          }),
        });
        if (res.status === 429) throw new Error("rate_limited");
        if (res.status === 402) throw new Error("credits_exhausted");
        if (res.ok) {
          const json = await res.json();
          const text: string = json?.choices?.[0]?.message?.content ?? "";
          try {
            const parsed = JSON.parse(text);
            mod = {
              severity: parsed.severity ?? "none",
              categories: Array.isArray(parsed.categories) ? parsed.categories : [],
              reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
            };
          } catch {
            // fall through with default
          }
        }
      } catch (err) {
        console.error("[moderation]", err);
      }
    }

    const severityForDb =
      mod.severity === "none" ? null : (mod.severity as "low" | "moderate" | "high" | "severe");
    const isFlagged = severityForDb !== null;

    const { data: inserted, error: insertErr } = await supabase
      .from("meeting_messages")
      .insert({
        meeting_id: data.meetingId,
        user_id: userId,
        content: data.content,
        is_flagged: isFlagged,
        severity: severityForDb,
      })
      .select()
      .single();

    if (insertErr) throw new Error(insertErr.message);

    const action = actionForSeverity(mod.severity);

    if (isFlagged) {
      await supabase.from("abuse_incidents").insert({
        meeting_id: data.meetingId,
        user_id: userId,
        message_id: inserted.id,
        severity: severityForDb!,
        category: mod.categories.join(",") || "general",
        excerpt: data.content.slice(0, 200),
        action_taken: action,
      });

      // Apply action: temporary mute or removal
      if (mod.severity === "moderate" || mod.severity === "high") {
        await supabase
          .from("meeting_participants")
          .update({ is_muted: true })
          .eq("meeting_id", data.meetingId)
          .eq("user_id", userId);
      }
      if (mod.severity === "severe") {
        await supabase
          .from("meeting_participants")
          .update({ is_removed: true, left_at: new Date().toISOString() })
          .eq("meeting_id", data.meetingId)
          .eq("user_id", userId);
      }

      // Reputation
      const delta = reputationDelta(mod.severity);
      if (delta !== 0) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("reputation")
          .eq("id", userId)
          .single();
        const next = Math.max(0, Math.min(100, (prof?.reputation ?? 100) + delta));
        await supabase
          .from("profiles")
          .update({
            reputation: next,
            is_blacklisted: next <= 10 ? true : false,
          })
          .eq("id", userId);
      }
    }

    return {
      messageId: inserted.id,
      severity: mod.severity,
      categories: mod.categories,
      action,
    };
  });
