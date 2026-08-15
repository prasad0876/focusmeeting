import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { friendlyError } from "@/lib/errors";

type Ctx = { supabase: any; userId: string };

async function isAdmin(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  return !!data;
}
async function isDeo(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "deo" });
  return !!data;
}
async function assertAdmin(ctx: Ctx) {
  if (!(await isAdmin(ctx))) throw new Error("Forbidden: admin only");
}
async function assertAdminOrDeo(ctx: Ctx) {
  if (!(await isAdmin(ctx)) && !(await isDeo(ctx))) throw new Error("Forbidden: admin or DEO only");
}
/** Staff = admin, DEO, HOD or faculty. Verified server-side via own-role read (RLS-safe). */
async function assertStaff(ctx: Ctx) {
  const { data } = await ctx.supabase.rpc("primary_role", { _user: ctx.userId });
  if (!data || data === "student") throw new Error("Forbidden: staff only");
  return data as string;
}

/* ---------------- Users ---------------- */

export const adminListUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrDeo(context);
    const { data: profiles, error } = await context.supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, reputation, is_blacklisted, status, department_id, created_at")
      .order("created_at", { ascending: false })
      .limit(500);
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
    await assertAdminOrDeo(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ is_blacklisted: data.blacklist })
      .eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Replace user's primary role. Only admin can grant admin or DEO. */
export const adminSetRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; role: "admin" | "deo" | "hod" | "faculty" | "student" }) => d)
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context);
    const deo = await isDeo(context);
    if (!admin && !deo) throw new Error("Forbidden");
    // only admin can create/remove admin or DEO
    if ((data.role === "admin" || data.role === "deo") && !admin) {
      throw new Error("Only super admin can grant admin or DEO");
    }
    if (data.userId === context.userId && data.role !== "admin") {
      // check if currently admin — if so, block self-demotion
      const { data: mine } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
      if (mine) throw new Error("You cannot demote yourself");
    }
    // wipe existing roles then insert new one
    const { error: delErr } = await context.supabase.from("user_roles").delete().eq("user_id", data.userId);
    if (delErr) throw new Error(delErr.message);
    const { error: insErr } = await context.supabase
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (insErr && !insErr.message.includes("duplicate")) throw new Error(insErr.message);
    return { ok: true };
  });

/* ---------------- Pending sign-ups ---------------- */

export const adminListPending = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrDeo(context);
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, handle, display_name, avatar_url, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const adminApproveUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    userId: string;
    role: "hod" | "faculty" | "student" | "deo" | "admin";
    departmentId?: string | null;
    sectionId?: string | null;
  }) => d)
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context);
    const deo = await isDeo(context);
    if (!admin && !deo) throw new Error("Forbidden");
    if ((data.role === "admin" || data.role === "deo") && !admin) {
      throw new Error("Only super admin can grant admin or DEO");
    }

    await context.supabase.from("user_roles").delete().eq("user_id", data.userId);
    const { error: roleErr } = await context.supabase
      .from("user_roles")
      .insert({ user_id: data.userId, role: data.role });
    if (roleErr && !roleErr.message.includes("duplicate")) throw new Error(roleErr.message);

    const profUpdate: any = { status: "active" };
    if (data.departmentId) profUpdate.department_id = data.departmentId;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error: pErr } = await supabaseAdmin.from("profiles").update(profUpdate).eq("id", data.userId);
    if (pErr) throw new Error(pErr.message);

    if (data.sectionId) {
      if (data.role === "student") {
        await context.supabase.from("student_sections").insert({ student_id: data.userId, section_id: data.sectionId });
      } else if (data.role === "faculty") {
        await context.supabase.from("faculty_sections").insert({ faculty_id: data.userId, section_id: data.sectionId });
      }
    }
    return { ok: true };
  });

export const adminRejectUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOrDeo(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("profiles").update({ status: "rejected" }).eq("id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Sections / Departments ---------------- */

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("departments")
      .select("id, name, code, hod_id")
      .order("name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; code: string; hodId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOrDeo(context);
    const { error } = await context.supabase.from("departments").insert({
      name: data.name.trim(),
      code: data.code.trim().toUpperCase(),
      hod_id: data.hodId ?? null,
    });
    if (error) throw new Error(friendlyError(error));
    return { ok: true };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { departmentId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOrDeo(context);
    const { error } = await context.supabase.from("departments").delete().eq("id", data.departmentId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { departmentId?: string | null } | undefined) => d ?? {})
  .handler(async ({ data, context }) => {
    let q = context.supabase.from("sections").select("id, name, department_id, slot_count, is_locked").order("name");
    if (data?.departmentId) q = q.eq("department_id", data.departmentId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const createSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string; departmentId: string; slotCount?: number }) => d)
  .handler(async ({ data, context }) => {
    // admin/deo, or HOD of that dept
    const admin = await isAdmin(context);
    const deo = await isDeo(context);
    if (!admin && !deo) {
      const { data: dept } = await context.supabase
        .from("departments")
        .select("id")
        .eq("id", data.departmentId)
        .eq("hod_id", context.userId)
        .maybeSingle();
      if (!dept) throw new Error("Forbidden");
    }
    const { error } = await context.supabase.from("sections").insert({
      name: data.name.trim(),
      department_id: data.departmentId,
      slot_count: data.slotCount ?? 7,
    });
    if (error) throw new Error(friendlyError(error));
    return { ok: true };
  });

export const deleteSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sectionId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOrDeo(context);
    const { error } = await context.supabase.from("sections").delete().eq("id", data.sectionId);
    if (error) throw new Error(friendlyError(error));
    return { ok: true };
  });

export const assignToSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; sectionId: string; kind: "student" | "faculty" }) => d)
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    // RLS restricts writes to admin / deo / HOD-of-department / faculty-of-section.
    if (data.kind === "student") {
      const { error } = await sb.from("student_sections").insert({ student_id: data.userId, section_id: data.sectionId });
      if (error) {
        if (/duplicate/i.test(error.message)) throw new Error("That student is already in this section.");
        throw new Error(friendlyError(error));
      }
    } else {
      const { error } = await sb.from("faculty_sections").insert({ faculty_id: data.userId, section_id: data.sectionId });
      if (error) {
        if (/duplicate/i.test(error.message)) throw new Error("That faculty member is already assigned to this section.");
        throw new Error(friendlyError(error));
      }
    }
    return { ok: true };
  });

export const removeFromSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; sectionId: string; kind: "student" | "faculty" }) => d)
  .handler(async ({ data, context }) => {
    const sb: any = context.supabase;
    if (data.kind === "student") {
      const { error } = await sb.from("student_sections").delete().eq("student_id", data.userId).eq("section_id", data.sectionId);
      if (error) throw new Error(friendlyError(error));
    } else {
      const { error } = await sb.from("faculty_sections").delete().eq("faculty_id", data.userId).eq("section_id", data.sectionId);
      if (error) throw new Error(friendlyError(error));
    }
    return { ok: true };
  });

/** Search users with the `student` role by handle or display name.
 *  Available to admin, DEO, HOD, and faculty. Results are limited to 25 rows. */
export const searchStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { q: string }) => d)
  .handler(async ({ data, context }) => {
    const q = (data.q ?? "").trim();
    if (q.length < 2) return [];
    // Caller must be staff. Verified through their own role, then we read the
    // student directory with the privileged client (RLS hides students that are
    // not yet enrolled in the caller's sections, which is exactly who we search).
    await assertStaff(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const sb: any = supabaseAdmin;
    const { data: roles, error: rErr } = await sb
      .from("user_roles")
      .select("user_id")
      .eq("role", "student");
    if (rErr) throw new Error(friendlyError(rErr));
    const ids = (roles ?? []).map((r: any) => r.user_id);
    if (ids.length === 0) return [];
    const like = `%${q.replace(/[%_]/g, "")}%`;
    const { data: profs, error: pErr } = await sb
      .from("profiles")
      .select("id, handle, display_name, avatar_url, department_id, status")
      .in("id", ids)
      .or(`handle.ilike.${like},display_name.ilike.${like}`)
      .eq("status", "active")
      .limit(25);
    if (pErr) throw new Error(friendlyError(pErr));
    return profs ?? [];
  });

/* ---------------- Meetings ---------------- */

export const adminListMeetings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrDeo(context);
    const { data, error } = await context.supabase
      .from("meetings")
      .select("id, title, status, host_id, created_at, started_at, ended_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const meetings = data ?? [];
    const hostIds = Array.from(new Set(meetings.map((m: any) => m.host_id)));
    if (hostIds.length === 0) return meetings;
    const { data: profs } = await context.supabase.from("profiles").select("id, handle, display_name").in("id", hostIds);
    const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
    return meetings.map((m: any) => ({ ...m, host: map.get(m.host_id) ?? null }));
  });

export const adminEndMeeting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { meetingId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdminOrDeo(context);
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
    await assertAdminOrDeo(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
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
    await assertAdminOrDeo(context);
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
    const { data, error } = await context.supabase
      .from("abuse_incidents")
      .select("id, meeting_id, user_id, severity, category, action_taken, excerpt, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
