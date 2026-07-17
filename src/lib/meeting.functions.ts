import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { RoomServiceClient } from "livekit-server-sdk";

/**
 * End a meeting: called by the host (or admin) when they leave.
 * Marks the meeting as ended, stamps left_at on all active participants,
 * and force-deletes the LiveKit room so every remaining peer is disconnected.
 */
export const hostEndMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { meetingId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: meeting, error: mErr } = await supabase
      .from("meetings")
      .select("id, host_id, status")
      .eq("id", data.meetingId)
      .maybeSingle();
    if (mErr || !meeting) throw new Error("Meeting not found");

    const { data: isAdmin } = await supabase.rpc("has_role", {
      _user_id: userId,
      _role: "admin",
    });
    if (meeting.host_id !== userId && !isAdmin) {
      throw new Error("Only the host can end this meeting");
    }

    if (meeting.status !== "ended") {
      const { error } = await supabase
        .from("meetings")
        .update({ status: "ended", ended_at: new Date().toISOString() })
        .eq("id", data.meetingId);
      if (error) throw new Error(error.message);

      await supabase
        .from("meeting_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("meeting_id", data.meetingId)
        .is("left_at", null);
    }

    // Force-disconnect everyone from the LiveKit room.
    const url = process.env.LIVEKIT_URL;
    const key = process.env.LIVEKIT_API_KEY;
    const secret = process.env.LIVEKIT_API_SECRET;
    if (url && key && secret) {
      try {
        // RoomServiceClient uses HTTPS; convert wss:// -> https://
        const httpUrl = url.replace(/^wss:/i, "https:").replace(/^ws:/i, "http:");
        const svc = new RoomServiceClient(httpUrl, key, secret);
        await svc.deleteRoom(data.meetingId);
      } catch (e) {
        console.error("livekit deleteRoom failed", e);
      }
    }

    return { ok: true };
  });
