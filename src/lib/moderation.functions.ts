import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ModerateInput = z.object({
  meetingId: z.string().uuid(),
  content: z.string().min(1).max(2000),
});

/** Scan a chat message for abuse, log it, and apply enforcement. */
export const moderateAndSendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ModerateInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { classifyAbuse, enforceAbuse } = await import("@/lib/moderation.server");

    const mod = await classifyAbuse(data.content);
    const severityForDb =
      mod.severity === "none" ? null : (mod.severity as "low" | "moderate" | "high" | "severe");

    const { data: inserted, error: insertErr } = await supabase
      .from("meeting_messages")
      .insert({
        meeting_id: data.meetingId,
        user_id: userId,
        content: data.content,
        is_flagged: severityForDb !== null,
        severity: severityForDb,
      })
      .select()
      .single();
    if (insertErr) throw new Error(insertErr.message);

    const { action } = await enforceAbuse({
      supabase,
      userId,
      meetingId: data.meetingId,
      content: data.content,
      mod,
      messageId: inserted.id,
      source: "chat",
    });

    return {
      messageId: inserted.id,
      severity: mod.severity,
      categories: mod.categories,
      reasoning: mod.reasoning,
      action,
    };
  });

const SpeechInput = z.object({
  meetingId: z.string().uuid(),
  content: z.string().min(1).max(4000),
});

/** Scan a speech-to-text transcript of what someone said out loud. */
export const moderateSpeech = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SpeechInput.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { classifyAbuse, enforceAbuse } = await import("@/lib/moderation.server");

    const mod = await classifyAbuse(data.content);
    const { action } = await enforceAbuse({
      supabase,
      userId,
      meetingId: data.meetingId,
      content: data.content,
      mod,
      source: "speech",
    });

    return { severity: mod.severity, categories: mod.categories, reasoning: mod.reasoning, action };
  });

