import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "deo" | "hod" | "faculty" | "student";

export function useMyRole(userId: string | undefined) {
  const [role, setRole] = useState<AppRole | null>(null);
  const [status, setStatus] = useState<string>("active");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!userId) {
      setRole(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [{ data: rpc }, { data: prof }] = await Promise.all([
        supabase.rpc("primary_role", { _user: userId }),
        supabase.from("profiles").select("status").eq("id", userId).maybeSingle(),
      ]);
      if (!active) return;
      setRole((rpc as AppRole) ?? null);
      setStatus((prof?.status as string) ?? "active");
      setLoading(false);
    })();

    const ch = supabase
      .channel(`role-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "user_roles", filter: `user_id=eq.${userId}` }, async () => {
        const { data } = await supabase.rpc("primary_role", { _user: userId });
        if (active) setRole((data as AppRole) ?? null);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` }, (payload) => {
        if (active) setStatus(((payload.new as any).status as string) ?? "active");
      })
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(ch);
    };
  }, [userId]);

  const isAdmin = role === "admin";
  const isDeo = role === "deo";
  const isHod = role === "hod";
  const isFaculty = role === "faculty";
  const isStudent = role === "student";
  const canManageInstitution = isAdmin || isDeo;
  const canTeach = isAdmin || isDeo || isHod || isFaculty;

  return { role, status, loading, isAdmin, isDeo, isHod, isFaculty, isStudent, canManageInstitution, canTeach };
}
