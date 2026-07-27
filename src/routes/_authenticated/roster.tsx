import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Users, UserPlus, Trash2, Search, GraduationCap } from "lucide-react";
import { myTeachingSections, listSectionStudents } from "@/lib/school.functions";
import { searchStudents, assignToSection, removeFromSection } from "@/lib/admin.functions";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/roster")({
  head: () => ({
    meta: [
      { title: "Section roster · focus.meet" },
      { name: "description", content: "Manage students enrolled in your sections." },
    ],
  }),
  beforeLoad: async ({ context }) => {
    const uid = (context as any).user.id;
    const { data: r } = await supabase.rpc("primary_role", { _user: uid });
    if (!r || r === "student") throw redirect({ to: "/dashboard" });
  },
  component: RosterPage,
});

function RosterPage() {
  const secFn = useServerFn(myTeachingSections);
  const stuFn = useServerFn(listSectionStudents);
  const searchFn = useServerFn(searchStudents);
  const addFn = useServerFn(assignToSection);
  const removeFn = useServerFn(removeFromSection);

  const [sections, setSections] = useState<any[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [roster, setRoster] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  const section = useMemo(() => sections.find((s) => s.id === sectionId), [sections, sectionId]);

  useEffect(() => {
    secFn()
      .then((s: any[]) => {
        setSections(s);
        if (s.length && !sectionId) setSectionId(s[0].id);
      })
      .catch((e) => toast.error(friendlyError(e)));
    // eslint-disable-next-line
  }, []);

  const refreshRoster = () => {
    if (!sectionId) return;
    stuFn({ data: { sectionId } })
      .then((s: any[]) => setRoster(s))
      .catch((e) => toast.error(friendlyError(e)));
  };

  useEffect(() => {
    refreshRoster();
    setResults([]);
    setQ("");
    // eslint-disable-next-line
  }, [sectionId]);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchFn({ data: { q: q.trim() } })
        .then((r: any[]) => setResults(r))
        .catch((e) => toast.error(friendlyError(e)));
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line
  }, [q]);

  const enrolledIds = useMemo(() => new Set(roster.map((r: any) => r.id)), [roster]);

  const doAdd = async (userId: string) => {
    if (!sectionId) return;
    setBusy(true);
    try {
      await addFn({ data: { userId, sectionId, kind: "student" } });
      toast.success("Student added to section");
      setQ("");
      setResults([]);
      refreshRoster();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async (userId: string, name: string) => {
    if (!sectionId) return;
    if (!confirm(`Remove ${name} from this section?`)) return;
    setBusy(true);
    try {
      await removeFn({ data: { userId, sectionId, kind: "student" } });
      toast.success("Student removed");
      refreshRoster();
    } catch (e: any) {
      toast.error(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <header className="flex items-center gap-3">
        <div className="size-10 rounded-md bg-primary/15 grid place-items-center">
          <Users className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Section roster</h1>
          <p className="text-sm text-muted-foreground">Add or remove students in the sections you manage.</p>
        </div>
      </header>

      {sections.length === 0 ? (
        <Card className="p-8 text-center bg-surface border-border/60 text-sm text-muted-foreground">
          You don't manage any sections yet.
        </Card>
      ) : (
        <>
          <Card className="p-4 bg-surface border-border/60 space-y-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="size-4 text-muted-foreground" />
              <Select value={sectionId} onValueChange={setSectionId}>
                <SelectTrigger className="max-w-md">
                  <SelectValue placeholder="Pick a section" />
                </SelectTrigger>
                <SelectContent>
                  {sections.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.department_name ? ` · ${s.department_name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground ml-auto">
                {roster.length} student{roster.length === 1 ? "" : "s"}
              </span>
            </div>
          </Card>

          <Card className="p-4 bg-surface border-border/60 space-y-3">
            <p className="text-sm font-medium flex items-center gap-2">
              <UserPlus className="size-4" /> Add students
            </p>
            <div className="flex items-center gap-2">
              <Search className="size-4 text-muted-foreground" />
              <Input
                placeholder="Search by handle or name (min 2 chars)"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
            </div>
            {results.length > 0 && (
              <div className="divide-y divide-border/60 rounded-md border border-border/60">
                {results.map((r: any) => {
                  const already = enrolledIds.has(r.id);
                  return (
                    <div key={r.id} className="flex items-center gap-3 p-3">
                      <div className="size-8 rounded-full bg-secondary/60 grid place-items-center text-xs font-mono">
                        {r.display_name?.[0] ?? "?"}
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{r.display_name}</div>
                        <p className="text-xs text-muted-foreground">@{r.handle}</p>
                      </div>
                      <Button size="sm" onClick={() => doAdd(r.id)} disabled={busy || already}>
                        {already ? "Already added" : "Add"}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
            {q.trim().length >= 2 && results.length === 0 && (
              <p className="text-xs text-muted-foreground">No matching students found.</p>
            )}
          </Card>

          <Card className="bg-surface border-border/60 divide-y divide-border/60">
            <div className="p-4 text-sm font-medium">Enrolled students</div>
            {roster.length === 0 && (
              <div className="p-6 text-sm text-muted-foreground">No students enrolled yet.</div>
            )}
            {roster.map((s: any) => (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="size-8 rounded-full bg-secondary/60 grid place-items-center text-xs font-mono">
                  {s.display_name?.[0] ?? "?"}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium">{s.display_name}</div>
                  <p className="text-xs text-muted-foreground">@{s.handle} · rep {s.reputation ?? 0}</p>
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => doRemove(s.id, s.display_name)}
                  disabled={busy}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </Card>
        </>
      )}
    </div>
  );
}
