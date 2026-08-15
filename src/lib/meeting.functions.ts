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

/**
 * Create a meeting scoped to a section and invite every enrolled student.
 * Only staff who manage the section (admin, DEO, HOD of its department,
 * or assigned faculty) may do this.
 */
export const createSectionMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; description?: string | null; sectionId: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const title = data.title.trim();
    if (!title) throw new Error("Title is required");

    const [{ data: isAdmin }, { data: isDeo }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: userId, _role: "deo" }),
    ]);

    const { data: section, error: sErr } = await supabase
      .from("sections")
      .select("id, name, department_id")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!section) throw new Error("You don't have access to this section.");

    let allowed = Boolean(isAdmin || isDeo);
    if (!allowed) {
      const { data: dept } = await supabase
        .from("departments")
        .select("id")
        .eq("id", section.department_id)
        .eq("hod_id", userId)
        .maybeSingle();
      allowed = Boolean(dept);
    }
    if (!allowed) {
      const { data: fs } = await supabase
        .from("faculty_sections")
        .select("id")
        .eq("section_id", section.id)
        .eq("faculty_id", userId)
        .maybeSingle();
      allowed = Boolean(fs);
    }
    if (!allowed) throw new Error("You can't start a meeting for this section.");

    const { data: meeting, error: mErr } = await supabase
      .from("meetings")
      .insert({
        host_id: userId,
        title,
        description: data.description?.trim() || null,
        status: "live",
        started_at: new Date().toISOString(),
        scope: "section",
        section_id: section.id,
        department_id: section.department_id,
      })
      .select("id")
      .single();
    if (mErr || !meeting) throw new Error(mErr?.message ?? "Could not create meeting");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: enrolled, error: eErr } = await supabaseAdmin
      .from("student_sections")
      .select("student_id")
      .eq("section_id", section.id);
    if (eErr) throw new Error(eErr.message);

    const ids = [...new Set((enrolled ?? []).map((r: any) => r.student_id as string))].filter(
      (id) => id !== userId,
    );
    if (ids.length > 0) {
      const { error: iErr } = await supabaseAdmin.from("meeting_invitations").insert(
        ids.map((id) => ({ meeting_id: meeting.id, invitee_id: id, inviter_id: userId })),
      );
      if (iErr) throw new Error(iErr.message);
    }

    return { meetingId: meeting.id, invited: ids.length, sectionName: section.name };
  });
