import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { friendlyError } from "@/lib/errors";

type Ctx = { supabase: any; userId: string };

async function assertAdminOrDeo(ctx: Ctx) {
  const [{ data: a }, { data: d }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "deo" }),
  ]);
  if (!a && !d) throw new Error("Forbidden: admin or DEO only");
}

export type AuditEntryInput = {
  internal_id: string;
  scanner_name?: string | null;
  severity?: string;
  category?: string | null;
  title: string;
  description?: string | null;
  status?: string;
  remediation?: string | null;
  files_changed?: string[];
  migration_notes?: string | null;
  resolved_at?: string | null;
};

export const listAuditEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdminOrDeo(context as Ctx);
    const { data, error } = await (context as Ctx).supabase
      .from("security_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(friendlyError(error));
    return data ?? [];
  });

export const createAuditEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: AuditEntryInput) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdminOrDeo(ctx);
    if (!data.internal_id?.trim()) throw new Error("A finding ID is required.");
    if (!data.title?.trim()) throw new Error("A title is required.");
    const { error } = await ctx.supabase.from("security_audit_log").insert({
      internal_id: data.internal_id.trim(),
      scanner_name: data.scanner_name?.trim() || null,
      severity: data.severity || "medium",
      category: data.category?.trim() || null,
      title: data.title.trim(),
      description: data.description?.trim() || null,
      status: data.status || "fixed",
      remediation: data.remediation?.trim() || null,
      files_changed: (data.files_changed ?? []).map((f) => f.trim()).filter(Boolean),
      migration_notes: data.migration_notes?.trim() || null,
      recorded_by: ctx.userId,
      resolved_at: data.resolved_at ?? ((data.status ?? "fixed") === "fixed" ? new Date().toISOString() : null),
    });
    if (error) throw new Error(friendlyError(error));
    return { ok: true };
  });

export const updateAuditEntryStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdminOrDeo(ctx);
    const { error } = await ctx.supabase
      .from("security_audit_log")
      .update({
        status: data.status,
        resolved_at: data.status === "fixed" ? new Date().toISOString() : null,
      })
      .eq("id", data.id);
    if (error) throw new Error(friendlyError(error));
    return { ok: true };
  });

export const deleteAuditEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const ctx = context as Ctx;
    await assertAdminOrDeo(ctx);
    const { error } = await ctx.supabase.from("security_audit_log").delete().eq("id", data.id);
    if (error) throw new Error(friendlyError(error));
    return { ok: true };
  });
