import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ModerateInput = z.object({
  meetingId: z.string().uuid(),
  // data URL like "data:image/jpeg;base64,...."; cap ~600KB base64
  imageDataUrl: z.string().min(40).max(900_000),
});

type ModerationResult = {
  severity: "none" | "low" | "moderate" | "high" | "severe";
  categories: string[];
  reasoning: string;
};

const SYSTEM_PROMPT = `You are a real-time visual moderator for a professional video conferencing platform.
You receive a single low-resolution frame from a participant's webcam.

Classify the frame for abusive or disruptive VISUAL content. Respond ONLY with strict JSON:
{"severity":"none|low|moderate|high|severe","categories":["..."],"reasoning":"short"}.

Severity rubric (be conservative — a normal person on camera, an empty chair, a blurry frame, or a dark room is "none"):
- none: normal participant, normal background, normal objects.
- low: mildly distracting visual (eating loudly on cam, costume, joke prop). No need to act harshly.
- moderate: rude/offensive gesture (e.g. middle finger), offensive clothing/text, deliberate face-covering disruption.
- high: hateful symbols/imagery, sexual content, nudity, weapons displayed threateningly, harassment gestures.
- severe: explicit sexual content, graphic violence, hate symbols paired with threats, displayed weapons aimed at camera.

Categories may include: nudity, sexual, weapon, hate_symbol, offensive_gesture, harassment, graphic_violence, spam_visual.

Never invent content that is not clearly visible. If unsure, return "none".`;

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

export const moderateVideoFrame = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ModerateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const apiKey = process.env.LOVABLE_API_KEY;

    let mod: ModerationResult = { severity: "none", categories: [], reasoning: "no-ai" };
    if (!apiKey) {
      return { severity: mod.severity, categories: mod.categories, action: "none" };
    }

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
            {
              role: "user",
              content: [
                { type: "text", text: "Classify this webcam frame." },
                { type: "image_url", image_url: { url: data.imageDataUrl } },
              ],
            },
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
          // ignore
        }
      }
    } catch (err) {
      console.error("[video-moderation]", err);
      return { severity: "none" as const, categories: [], action: "none" };
    }

    if (mod.severity === "none") {
      return { severity: mod.severity, categories: mod.categories, action: "none" };
    }

    const severityForDb = mod.severity as "low" | "moderate" | "high" | "severe";
    const action = actionForSeverity(mod.severity);
    // Enforcement writes moderation columns the user is not allowed to set themselves.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    await supabase.from("abuse_incidents").insert({
      meeting_id: data.meetingId,
      user_id: userId,
      message_id: null,
      severity: severityForDb,
      category: `visual:${mod.categories.join(",") || "general"}`,
      // Privacy: never store the image; store a short text excerpt of the reason.
      excerpt: mod.reasoning.slice(0, 200),
      action_taken: action,
    });

    if (mod.severity === "moderate" || mod.severity === "high") {
      await supabaseAdmin
        .from("meeting_participants")
        .update({ is_muted: true })
        .eq("meeting_id", data.meetingId)
        .eq("user_id", userId);
    }
    if (mod.severity === "severe") {
      await supabaseAdmin
        .from("meeting_participants")
        .update({ is_removed: true, left_at: new Date().toISOString() })
        .eq("meeting_id", data.meetingId)
        .eq("user_id", userId);
    }

    const delta = reputationDelta(mod.severity);
    if (delta !== 0) {
      const { data: prof } = await supabase
        .from("profiles")
        .select("reputation")
        .eq("id", userId)
        .single();
      const next = Math.max(0, Math.min(100, (prof?.reputation ?? 100) + delta));
      await supabaseAdmin
        .from("profiles")
        .update({
          reputation: next,
          is_blacklisted: next <= 10 ? true : false,
        })
        .eq("id", userId);
    }

    return { severity: mod.severity, categories: mod.categories, action };
  });
