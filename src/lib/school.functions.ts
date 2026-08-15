import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/* ------------ Section membership listing ------------ */

/** Sections the current user can teach/manage. */
export const myTeachingSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const sb = context.supabase;
    const [{ data: isAdminRes }, { data: isDeoRes }] = await Promise.all([
      sb.rpc("has_role", { _user_id: uid, _role: "admin" }),
      sb.rpc("has_role", { _user_id: uid, _role: "deo" }),
    ]);
    if (isAdminRes || isDeoRes) {
      const { data } = await sb
        .from("sections")
        .select("id, name, department_id, slot_count, departments(name)")
        .order("name");
      return (data ?? []).map((r: any) => ({ ...r, department_name: r.departments?.name }));
    }
    // HOD sections
    const { data: depts } = await sb.from("departments").select("id, name").eq("hod_id", uid);
    const hodDeptIds = (depts ?? []).map((d: any) => d.id);
    // Faculty sections
    const { data: fs } = await sb.from("faculty_sections").select("section_id").eq("faculty_id", uid);
    const facSectionIds = (fs ?? []).map((r: any) => r.section_id);

    const orClauses: string[] = [];
    if (hodDeptIds.length) orClauses.push(`department_id.in.(${hodDeptIds.join(",")})`);
    if (facSectionIds.length) orClauses.push(`id.in.(${facSectionIds.join(",")})`);
    if (orClauses.length === 0) return [];
    const { data } = await sb
      .from("sections")
      .select("id, name, department_id, slot_count, departments(name)")
      .or(orClauses.join(","))
      .order("name");
    return (data ?? []).map((r: any) => ({ ...r, department_name: r.departments?.name }));
  });

export const listSectionStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sectionId: string }) => d)
  .handler(async ({ data, context }) => {
    // Authorize: the section must be visible to the caller under RLS
    // (admin/DEO, HOD of its department, faculty of the section, or enrolled student).
    const { data: sec, error: secErr } = await context.supabase
      .from("sections")
      .select("id")
      .eq("id", data.sectionId)
      .maybeSingle();
    if (secErr) throw new Error(secErr.message);
    if (!sec) throw new Error("You don't have access to this section.");

    // Roster names are then read with the privileged client so partial profile
    // visibility never renders an empty roster for an authorized manager.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("student_sections")
      .select("student_id")
      .eq("section_id", data.sectionId);
    if (error) throw new Error(error.message);
    const ids = (rows ?? []).map((r: any) => r.student_id);
    if (ids.length === 0) return [];
    const { data: profs, error: pErr } = await supabaseAdmin
      .from("profiles")
      .select("id, handle, display_name, reputation, avatar_url")
      .in("id", ids);
    if (pErr) throw new Error(pErr.message);
    return (profs ?? []).sort((a: any, b: any) => a.display_name.localeCompare(b.display_name));
  });

/* ------------ Attendance ------------ */

export const listAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sectionId: string; date: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("attendance")
      .select("id, student_id, date, slot, status, notes")
      .eq("section_id", data.sectionId)
      .eq("date", data.date);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    sectionId: string;
    date: string;
    slot: number;
    studentId: string;
    status: "present" | "absent" | "late";
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("attendance").upsert(
      {
        section_id: data.sectionId,
        student_id: data.studentId,
        date: data.date,
        slot: data.slot,
        status: data.status,
        notes: data.notes ?? null,
        marked_by: context.userId,
      },
      { onConflict: "section_id,student_id,date,slot" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const myAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("attendance")
      .select("id, section_id, date, slot, status, notes, sections(name)")
      .eq("student_id", context.userId)
      .order("date", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ ...r, section_name: r.sections?.name }));
  });

/* ------------ Gradebook ------------ */

export const listGrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { sectionId: string }) => d)
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("gradebook_entries")
      .select("id, student_id, subject, exam_type, term, marks, max_marks, notes, created_at")
      .eq("section_id", data.sectionId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const upsertGrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id?: string;
    sectionId: string;
    studentId: string;
    subject: string;
    examType: string;
    term?: string;
    marks: number;
    maxMarks: number;
    notes?: string;
  }) => d)
  .handler(async ({ data, context }) => {
    const payload: any = {
      section_id: data.sectionId,
      student_id: data.studentId,
      subject: data.subject.trim(),
      exam_type: data.examType.trim(),
      term: data.term ?? null,
      marks: data.marks,
      max_marks: data.maxMarks,
      notes: data.notes ?? null,
      entered_by: context.userId,
    };
    if (data.id) {
      const { error } = await context.supabase.from("gradebook_entries").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.from("gradebook_entries").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteGrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("gradebook_entries").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const myGrades = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("gradebook_entries")
      .select("id, section_id, subject, exam_type, term, marks, max_marks, notes, created_at, sections(name)")
      .eq("student_id", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({ ...r, section_name: r.sections?.name }));
  });
