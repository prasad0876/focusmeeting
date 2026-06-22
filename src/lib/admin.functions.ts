import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, reputation, is_blacklisted, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const { data: roles } = await context.supabase.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r: any) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p: any) => ({ ...p, roles: roleMap.get(p.id) ?? [] }));
  });

export const adminSetBlacklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; blacklist: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("profiles")
      .update({ is_blacklisted: data.blacklist })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; grant: boolean }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.grant) {
      const { error } = await context.supabase
        .from("user_roles")
        .insert({ user_id: data.userId, role: "admin" });
      if (error && !error.message.includes("duplicate")) throw new Error(error.message);
    } else {
      if (data.userId === context.userId) throw new Error("You cannot revoke your own admin role");
      const { error } = await context.supabase
        .from("user_roles")
        .delete()
        .eq("user_id", data.userId)
        .eq("role", "admin");
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const adminListMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("meetings")
      .select("id, title, status, host_id, created_at, started_at, ended_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const meetings = data ?? [];
    const hostIds = Array.from(new Set(meetings.map((m: any) => m.host_id)));
    if (hostIds.length === 0) return meetings;
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("id, handle, display_name")
      .in("id", hostIds);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return meetings.map((m: any) => ({ ...m, host: map.get(m.host_id) ?? null }));
  });

export const adminEndMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { meetingId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("meetings")
      .update({ status: "ended", ended_at: new Date().toISOString() })
      .eq("id", data.meetingId);
    if (error) throw new Error(error.message);
    await context.supabase
      .from("meeting_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("meeting_id", data.meetingId)
      .is("left_at", null);
    return { ok: true };
  });

export const adminRemoveParticipant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { meetingId: string; userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("meeting_participants")
      .update({ is_removed: true, left_at: new Date().toISOString() })
      .eq("meeting_id", data.meetingId)
      .eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { meetingId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    // Children with FKs to meetings cascade-delete in order; rely on RLS admin delete policies.
    const id = data.meetingId;
    const sb = context.supabase;
    await sb.from("whiteboard_elements").delete().eq("meeting_id", id);
    await sb.from("meeting_transcripts").delete().eq("meeting_id", id);
    await sb.from("meeting_messages").delete().eq("meeting_id", id);
    await sb.from("meeting_summaries").delete().eq("meeting_id", id);
    await sb.from("meeting_action_items").delete().eq("meeting_id", id);
    await sb.from("focus_samples").delete().eq("meeting_id", id);
    await sb.from("abuse_incidents").delete().eq("meeting_id", id);
    await sb.from("meeting_participants").delete().eq("meeting_id", id);
    await sb.from("meeting_invitations").delete().eq("meeting_id", id);
    const { error } = await sb.from("meetings").delete().eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminListAbuse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("abuse_incidents")
      .select("id, meeting_id, user_id, severity, category, action_taken, excerpt, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
