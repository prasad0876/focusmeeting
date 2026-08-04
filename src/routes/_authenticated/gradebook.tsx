import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { GraduationCap, Trash2, Plus } from "lucide-react";
import {
  myTeachingSections,
  listSectionStudents,
  listGrades,
  upsertGrade,
  deleteGrade,
} from "@/lib/school.functions";

export const Route = createFileRoute("/_authenticated/gradebook")({
  head: () => ({ meta: [{ title: "Gradebook · Sentinel.meet" }] }),
  beforeLoad: async ({ context }) => {
    const uid = (context as any).user.id;
    const { data: r } = await supabase.rpc("primary_role", { _user: uid });
    if (!r || r === "student") throw redirect({ to: "/dashboard" });
  },
  component: GradebookPage,
});

function GradebookPage() {
  const secFn = useServerFn(myTeachingSections);
  const stuFn = useServerFn(listSectionStudents);
  const listFn = useServerFn(listGrades);
  const upFn = useServerFn(upsertGrade);
  const delFn = useServerFn(deleteGrade);

  const [sections, setSections] = useState<any[]>([]);
  const [sectionId, setSectionId] = useState("");
  const [students, setStudents] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const [form, setForm] = useState({ studentId: "", subject: "", examType: "internal-1", term: "", marks: "", maxMarks: "100", notes: "" });

  useEffect(() => {
    secFn().then((s: any) => { setSections(s); if (s.length && !sectionId) setSectionId(s[0].id); }).catch((e: any) => toast.error(friendlyError(e)));
  }, []); // eslint-disable-line

  const refresh = () => {
    if (!sectionId) return;
    Promise.all([stuFn({ data: { sectionId } }), listFn({ data: { sectionId } })])
      .then(([s, g]) => { setStudents(s as any[]); setGrades(g as any[]); })
      .catch((e: any) => toast.error(friendlyError(e)));
  };
  useEffect(refresh, [sectionId]); // eslint-disable-line

  useEffect(() => {
    if (!sectionId) return;
    const ch = supabase
      .channel(`gradebook-${sectionId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "gradebook_entries", filter: `section_id=eq.${sectionId}` },
        refresh)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [sectionId]); // eslint-disable-line

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.studentId || !form.subject || !form.marks) return toast.error("Student, subject and marks required");
    try {
      await upFn({ data: {
        sectionId, studentId: form.studentId, subject: form.subject, examType: form.examType,
        term: form.term || undefined, marks: parseFloat(form.marks), maxMarks: parseFloat(form.maxMarks) || 100,
        notes: form.notes || undefined,
      }});
      toast.success("Grade saved");
      setForm({ ...form, subject: "", marks: "", notes: "" });
    } catch (e: any) { toast.error(friendlyError(e)); }
  };

  const nameOf = (uid: string) => students.find((s) => s.id === uid)?.display_name ?? uid.slice(0, 6);

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 space-y-6">
      <header className="flex items-center gap-3">
        <div className="size-10 rounded-md bg-primary/15 grid place-items-center"><GraduationCap className="size-5 text-primary" /></div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Gradebook</h1>
          <p className="text-sm text-muted-foreground">Enter and edit marks per subject / exam / term.</p>
        </div>
      </header>

      <div className="grid sm:grid-cols-2 gap-2">
        <Select value={sectionId} onValueChange={setSectionId}>
          <SelectTrigger><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent>
            {sections.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name} · {s.department_name ?? ""}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      {sectionId && (
        <Card className="p-4 bg-surface border-border/60 space-y-3">
          <p className="text-sm font-medium flex items-center gap-2"><Plus className="size-4" /> Add / update marks</p>
          <form onSubmit={submit} className="grid sm:grid-cols-7 gap-2">
            <Select value={form.studentId} onValueChange={(v) => setForm({ ...form, studentId: v })}>
              <SelectTrigger className="sm:col-span-2"><SelectValue placeholder="Student" /></SelectTrigger>
              <SelectContent>
                {students.map((s) => (<SelectItem key={s.id} value={s.id}>{s.display_name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Input placeholder="Subject" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
            <Select value={form.examType} onValueChange={(v) => setForm({ ...form, examType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="internal-1">Internal 1</SelectItem>
                <SelectItem value="internal-2">Internal 2</SelectItem>
                <SelectItem value="mid-term">Mid-term</SelectItem>
                <SelectItem value="final">Final</SelectItem>
                <SelectItem value="assignment">Assignment</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Term (e.g. 2026-S1)" value={form.term} onChange={(e) => setForm({ ...form, term: e.target.value })} />
            <Input type="number" placeholder="Marks" value={form.marks} onChange={(e) => setForm({ ...form, marks: e.target.value })} />
            <Input type="number" placeholder="Max" value={form.maxMarks} onChange={(e) => setForm({ ...form, maxMarks: e.target.value })} />
            <Button type="submit" className="sm:col-span-7">Save mark</Button>
          </form>
        </Card>
      )}

      {sectionId && (
        <Card className="bg-surface border-border/60 divide-y divide-border/60">
          {grades.length === 0 && <div className="p-6 text-sm text-muted-foreground">No marks entered yet.</div>}
          {grades.map((g) => (
            <div key={g.id} className="flex items-center gap-3 p-4">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{nameOf(g.student_id)}</div>
                <p className="text-xs text-muted-foreground">{g.subject} · {g.exam_type}{g.term ? ` · ${g.term}` : ""}</p>
              </div>
              <div className="text-sm font-mono tabular-nums">{g.marks}<span className="text-muted-foreground">/{g.max_marks}</span></div>
              <Button size="sm" variant="ghost" onClick={async () => { if (confirm("Delete this mark?")) { try { await delFn({ data: { id: g.id } }); toast.success("Deleted"); } catch (e: any) { toast.error(friendlyError(e)); } } }}><Trash2 className="size-3.5" /></Button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
