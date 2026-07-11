import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { FileText, Plus, Send, GraduationCap, ClipboardList, Clock, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/assessments")({
  head: () => ({ meta: [{ title: "Assessments · Sentinel.meet" }] }),
  component: AssessmentsPage,
});

type Role = "admin" | "hod" | "faculty" | "student";
type Section = { id: string; name: string };
type Assessment = {
  id: string;
  section_id: string;
  created_by: string;
  title: string;
  description: string | null;
  due_at: string | null;
  max_score: number;
  created_at: string;
};
type Submission = {
  id: string;
  assessment_id: string;
  student_id: string;
  content: string;
  score: number | null;
  feedback: string | null;
  submitted_at: string;
  graded_at: string | null;
};

function AssessmentsPage() {
  const { user } = Route.useRouteContext();
  const [roles, setRoles] = useState<Role[]>([]);
  const [facultySections, setFacultySections] = useState<Section[]>([]);
  const [studentSections, setStudentSections] = useState<Section[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);

  const isFaculty = roles.some((r) => r === "faculty" || r === "hod" || r === "admin");
  const isStudent = roles.includes("student") || studentSections.length > 0;

  const loadAll = async () => {
    const [{ data: rolesData }, { data: fs }, { data: ss }] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", user.id),
      supabase.from("faculty_sections").select("section_id, sections(id, name)").eq("faculty_id", user.id),
      supabase.from("student_sections").select("section_id, sections(id, name)").eq("student_id", user.id),
    ]);
    setRoles((rolesData ?? []).map((r: any) => r.role));
    setFacultySections(((fs ?? []) as any[]).map((r) => r.sections).filter(Boolean));
    setStudentSections(((ss ?? []) as any[]).map((r) => r.sections).filter(Boolean));

    const [{ data: a }, { data: s }] = await Promise.all([
      supabase.from("assessments").select("*").order("created_at", { ascending: false }),
      supabase.from("assessment_submissions").select("*"),
    ]);
    setAssessments((a ?? []) as Assessment[]);
    setSubmissions((s ?? []) as Submission[]);
    setLoading(false);
  };

  useEffect(() => {
    loadAll();
    const ch = supabase
      .channel("assessments-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "assessments" }, loadAll)
      .on("postgres_changes", { event: "*", schema: "public", table: "assessment_submissions" }, loadAll)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const defaultTab = isFaculty && facultySections.length > 0 ? "faculty" : "student";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="size-10 rounded-lg bg-primary/15 grid place-items-center">
          <ClipboardList className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assessments</h1>
          <p className="text-sm text-muted-foreground">Faculty create tasks. Students submit and view results.</p>
        </div>
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : (
        <Tabs defaultValue={defaultTab}>
          <TabsList>
            {isFaculty && <TabsTrigger value="faculty"><GraduationCap className="size-4 mr-1.5" />Faculty</TabsTrigger>}
            {isStudent && <TabsTrigger value="student"><FileText className="size-4 mr-1.5" />Student</TabsTrigger>}
          </TabsList>
          {isFaculty && (
            <TabsContent value="faculty" className="mt-6">
              <FacultyView
                sections={facultySections}
                assessments={assessments.filter((a) => a.created_by === user.id || roles.includes("admin") || roles.includes("hod"))}
                submissions={submissions}
                userId={user.id}
                onChange={loadAll}
              />
            </TabsContent>
          )}
          {isStudent && (
            <TabsContent value="student" className="mt-6">
              <StudentView
                sections={studentSections}
                assessments={assessments.filter((a) => studentSections.some((s) => s.id === a.section_id))}
                submissions={submissions.filter((s) => s.student_id === user.id)}
                userId={user.id}
                onChange={loadAll}
              />
            </TabsContent>
          )}
        </Tabs>
      )}
    </div>
  );
}

function FacultyView({
  sections,
  assessments,
  submissions,
  userId,
  onChange,
}: {
  sections: Section[];
  assessments: Assessment[];
  submissions: Submission[];
  userId: string;
  onChange: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [maxScore, setMaxScore] = useState(100);
  const [sectionId, setSectionId] = useState(sections[0]?.id ?? "");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!sectionId && sections[0]) setSectionId(sections[0].id);
  }, [sections, sectionId]);

  const create = async () => {
    if (!title.trim() || !sectionId) {
      toast.error("Title and section required");
      return;
    }
    setCreating(true);
    const { error } = await supabase.from("assessments").insert({
      title: title.trim(),
      description: description.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      max_score: maxScore,
      section_id: sectionId,
      created_by: userId,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Assessment created");
    setTitle("");
    setDescription("");
    setDueAt("");
    setMaxScore(100);
    onChange();
  };

  if (sections.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        You aren't assigned to any sections yet. Ask an admin or HOD to assign you.
      </Card>
    );
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1fr)_360px] gap-6">
      <div className="space-y-3">
        {assessments.length === 0 && <Card className="p-6 text-sm text-muted-foreground">No assessments yet.</Card>}
        {assessments.map((a) => (
          <AssessmentGradeCard
            key={a.id}
            assessment={a}
            submissions={submissions.filter((s) => s.assessment_id === a.id)}
            sectionName={sections.find((s) => s.id === a.section_id)?.name ?? "Section"}
            onChange={onChange}
          />
        ))}
      </div>
      <Card className="p-5 h-fit space-y-3 sticky top-20">
        <div className="flex items-center gap-2">
          <Plus className="size-4 text-primary" />
          <h3 className="font-medium">New assessment</h3>
        </div>
        <div className="space-y-2">
          <Label>Section</Label>
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
          >
            {sections.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-2">
          <Label>Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Midterm essay" maxLength={200} />
        </div>
        <div className="space-y-2">
          <Label>Instructions</Label>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={4000} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label>Due</Label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Max score</Label>
            <Input type="number" min={1} max={1000} value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value) || 100)} />
          </div>
        </div>
        <Button onClick={create} disabled={creating} className="w-full">
          {creating ? "Creating…" : "Create assessment"}
        </Button>
      </Card>
    </div>
  );
}

function AssessmentGradeCard({
  assessment,
  submissions,
  sectionName,
  onChange,
}: {
  assessment: Assessment;
  submissions: Submission[];
  sectionName: string;
  onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [handles, setHandles] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || submissions.length === 0) return;
    const ids = submissions.map((s) => s.student_id);
    supabase.from("profiles").select("id, handle").in("id", ids).then(({ data }) => {
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => (map[p.id] = p.handle));
      setHandles(map);
    });
  }, [open, submissions]);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium truncate">{assessment.title}</h3>
            <Badge variant="secondary">{sectionName}</Badge>
            <Badge variant="outline">/{assessment.max_score}</Badge>
          </div>
          {assessment.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{assessment.description}</p>}
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-2">
            {assessment.due_at && (
              <span className="inline-flex items-center gap-1"><Clock className="size-3" />Due {new Date(assessment.due_at).toLocaleString()}</span>
            )}
            <span>{submissions.length} submission{submissions.length === 1 ? "" : "s"}</span>
          </div>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "View"}
        </Button>
      </div>
      {open && (
        <div className="mt-4 space-y-3 border-t border-border/60 pt-4">
          {submissions.length === 0 && <p className="text-sm text-muted-foreground">No submissions yet.</p>}
          {submissions.map((s) => (
            <GradeRow key={s.id} submission={s} handle={handles[s.student_id] ?? "student"} maxScore={assessment.max_score} onChange={onChange} />
          ))}
        </div>
      )}
    </Card>
  );
}

function GradeRow({
  submission,
  handle,
  maxScore,
  onChange,
}: {
  submission: Submission;
  handle: string;
  maxScore: number;
  onChange: () => void;
}) {
  const { user } = Route.useRouteContext();
  const [score, setScore] = useState<string>(submission.score?.toString() ?? "");
  const [feedback, setFeedback] = useState<string>(submission.feedback ?? "");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const n = Number(score);
    if (!Number.isFinite(n) || n < 0 || n > maxScore) {
      toast.error(`Score must be 0–${maxScore}`);
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("assessment_submissions")
      .update({ score: n, feedback: feedback.trim() || null, graded_at: new Date().toISOString(), graded_by: user.id })
      .eq("id", submission.id);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Graded");
    onChange();
  };

  return (
    <div className="rounded-md border border-border/60 p-3 space-y-2 bg-secondary/20">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-mono">@{handle}</span>
        <span className="text-xs text-muted-foreground">{new Date(submission.submitted_at).toLocaleString()}</span>
      </div>
      <p className="text-sm whitespace-pre-wrap">{submission.content}</p>
      <div className="grid grid-cols-[100px_1fr_auto] gap-2 items-end">
        <div>
          <Label className="text-xs">Score /{maxScore}</Label>
          <Input value={score} onChange={(e) => setScore(e.target.value)} type="number" min={0} max={maxScore} />
        </div>
        <div>
          <Label className="text-xs">Feedback</Label>
          <Input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Optional" />
        </div>
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? "…" : submission.graded_at ? "Update" : "Grade"}
        </Button>
      </div>
    </div>
  );
}

function StudentView({
  sections,
  assessments,
  submissions,
  userId,
  onChange,
}: {
  sections: Section[];
  assessments: Assessment[];
  submissions: Submission[];
  userId: string;
  onChange: () => void;
}) {
  const submissionMap = useMemo(() => {
    const m = new Map<string, Submission>();
    submissions.forEach((s) => m.set(s.assessment_id, s));
    return m;
  }, [submissions]);

  if (sections.length === 0) {
    return (
      <Card className="p-6 text-sm text-muted-foreground">
        You aren't enrolled in any sections yet.
      </Card>
    );
  }

  if (assessments.length === 0) {
    return <Card className="p-6 text-sm text-muted-foreground">No assessments assigned yet.</Card>;
  }

  return (
    <div className="space-y-3">
      {assessments.map((a) => (
        <StudentAssessmentCard
          key={a.id}
          assessment={a}
          submission={submissionMap.get(a.id)}
          sectionName={sections.find((s) => s.id === a.section_id)?.name ?? "Section"}
          userId={userId}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

function StudentAssessmentCard({
  assessment,
  submission,
  sectionName,
  userId,
  onChange,
}: {
  assessment: Assessment;
  submission: Submission | undefined;
  sectionName: string;
  userId: string;
  onChange: () => void;
}) {
  const [content, setContent] = useState(submission?.content ?? "");
  const [saving, setSaving] = useState(false);
  const graded = !!submission?.graded_at;
  const locked = graded;
  const overdue = assessment.due_at ? new Date(assessment.due_at).getTime() < Date.now() : false;

  const submit = async () => {
    if (!content.trim()) {
      toast.error("Answer cannot be empty");
      return;
    }
    setSaving(true);
    if (submission) {
      const { error } = await supabase
        .from("assessment_submissions")
        .update({ content: content.trim(), submitted_at: new Date().toISOString() })
        .eq("id", submission.id);
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Submission updated");
    } else {
      const { error } = await supabase.from("assessment_submissions").insert({
        assessment_id: assessment.id,
        student_id: userId,
        content: content.trim(),
      });
      setSaving(false);
      if (error) return toast.error(error.message);
      toast.success("Submitted");
    }
    onChange();
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-medium">{assessment.title}</h3>
            <Badge variant="secondary">{sectionName}</Badge>
            {graded && (
              <Badge className="bg-success/20 text-success border-success/40">
                <CheckCircle2 className="size-3 mr-1" />
                Graded {submission!.score}/{assessment.max_score}
              </Badge>
            )}
            {!graded && submission && <Badge variant="outline">Submitted</Badge>}
            {!submission && overdue && <Badge variant="destructive">Overdue</Badge>}
          </div>
          {assessment.description && <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{assessment.description}</p>}
          {assessment.due_at && (
            <p className="text-xs text-muted-foreground mt-2 inline-flex items-center gap-1">
              <Clock className="size-3" />Due {new Date(assessment.due_at).toLocaleString()}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label className="text-xs">Your answer</Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          maxLength={10000}
          disabled={locked}
          placeholder="Type your response…"
        />
        {graded && submission?.feedback && (
          <div className="text-sm rounded-md border border-border/60 bg-secondary/30 p-3">
            <span className="text-xs text-muted-foreground">Feedback</span>
            <p className="mt-1 whitespace-pre-wrap">{submission.feedback}</p>
          </div>
        )}
        {!locked && (
          <div className="flex justify-end">
            <Button onClick={submit} disabled={saving}>
              <Send className="size-4 mr-1.5" />
              {saving ? "Saving…" : submission ? "Update submission" : "Submit"}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
