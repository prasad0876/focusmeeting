import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { CalendarCheck, Check, X, Clock } from "lucide-react";
import {
  myTeachingSections,
  listSectionStudents,
  listAttendance,
  upsertAttendance,
} from "@/lib/school.functions";

export const Route = createFileRoute("/_authenticated/attendance")({
  head: () => ({ meta: [{ title: "Attendance · Sentinel.meet" }] }),
  beforeLoad: async ({ context }) => {
    const uid = (context as any).user.id;
    const { data: r } = await supabase.rpc("primary_role", { _user: uid });
    if (!r || r === "student") throw redirect({ to: "/dashboard" });
  },
  component: AttendancePage,
});

function AttendancePage() {
  const secFn = useServerFn(myTeachingSections);
  const stuFn = useServerFn(listSectionStudents);
  const attFn = useServerFn(listAttendance);
  const upFn = useServerFn(upsertAttendance);

  const [sections, setSections] = useState<any[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = useState(1);
  const [students, setStudents] = useState<any[]>([]);
  const [attendance, setAttendance] = useState<Record<string, string>>({});

  const currentSection = useMemo(() => sections.find((s) => s.id === sectionId), [sections, sectionId]);
  const slotCount = currentSection?.slot_count ?? 7;

  useEffect(() => {
    secFn().then((s: any) => {
      setSections(s);
      if (s.length && !sectionId) setSectionId(s[0].id);
    }).catch((e: any) => toast.error(friendlyError(e)));
  }, []); // eslint-disable-line

  useEffect(() => {
    if (!sectionId) return;
    stuFn({ data: { sectionId } }).then((r: any) => setStudents(r)).catch((e: any) => toast.error(friendlyError(e)));
  }, [sectionId]); // eslint-disable-line

  const refreshAtt = () => {
    if (!sectionId) return;
    attFn({ data: { sectionId, date } }).then((rows: any) => {
      const map: Record<string, string> = {};
      rows.filter((r: any) => r.slot === slot).forEach((r: any) => (map[r.student_id] = r.status));
      setAttendance(map);
    }).catch((e: any) => toast.error(friendlyError(e)));
  };
  useEffect(refreshAtt, [sectionId, date, slot]); // eslint-disable-line

  useEffect(() => {
    if (!sectionId) return;
    const ch = supabase
      .channel(`attendance-${sectionId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "attendance", filter: `section_id=eq.${sectionId}` },
        refreshAtt)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sectionId, date, slot]); // eslint-disable-line

  const mark = async (studentId: string, status: "present" | "absent" | "late") => {
    setAttendance((a) => ({ ...a, [studentId]: status }));
    try { await upFn({ data: { sectionId, date, slot, studentId, status } }); }
    catch (e: any) { toast.error(friendlyError(e)); refreshAtt(); }
  };
  const markAll = async (status: "present" | "absent") => {
    for (const s of students) await mark(s.id, status);
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <header className="flex items-center gap-3">
        <div className="size-10 rounded-md bg-primary/15 grid place-items-center"><CalendarCheck className="size-5 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attendance</h1>
          <p className="text-sm text-muted-foreground">Section-wise offline attendance · default {slotCount} slots/day.</p>
        </div>
      </header>

      <Card className="p-4 bg-surface border-border/60">
        <div className="grid sm:grid-cols-4 gap-2">
          <Select value={sectionId} onValueChange={setSectionId}>
            <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
            <SelectContent>
              {sections.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name} · {s.department_name ?? ""}</SelectItem>))}
            </SelectContent>
          </Select>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Select value={String(slot)} onValueChange={(v) => setSlot(parseInt(v))}>
            <SelectTrigger><SelectValue placeholder="Slot" /></SelectTrigger>
            <SelectContent>
              {Array.from({ length: slotCount }, (_, i) => i + 1).map((n) => (
                <SelectItem key={n} value={String(n)}>Slot {n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => markAll("present")} className="flex-1">All present</Button>
            <Button size="sm" variant="outline" onClick={() => markAll("absent")} className="flex-1">All absent</Button>
          </div>
        </div>
      </Card>

      {!sectionId ? (
        <Card className="p-6 text-sm text-muted-foreground">Select a section to begin.</Card>
      ) : students.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground">No students enrolled in this section yet.</Card>
      ) : (
        <Card className="bg-surface border-border/60 divide-y divide-border/60">
          {students.map((s) => {
            const st = attendance[s.id];
            return (
              <div key={s.id} className="flex items-center gap-3 p-4">
                <div className="size-9 rounded-full bg-secondary grid place-items-center text-xs font-mono">
                  {s.display_name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.display_name}</div>
                  <p className="text-xs font-mono text-muted-foreground">@{s.handle}</p>
                </div>
                <Button size="sm" variant={st === "present" ? "default" : "outline"} onClick={() => mark(s.id, "present")}><Check className="size-3.5" /> Present</Button>
                <Button size="sm" variant={st === "late" ? "default" : "outline"} onClick={() => mark(s.id, "late")}><Clock className="size-3.5" /> Late</Button>
                <Button size="sm" variant={st === "absent" ? "destructive" : "outline"} onClick={() => mark(s.id, "absent")}><X className="size-3.5" /> Absent</Button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
