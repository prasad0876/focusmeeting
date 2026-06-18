import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generateMeetingSummary, askMeetingMemory } from "@/lib/meeting-memory.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles, Clock, ListChecks, MessageSquareQuote, Search,
  Wand2, ArrowLeft, CheckCircle2, Circle, BookOpenText,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/memory/$id")({
  head: () => ({ meta: [{ title: "Meeting Memory · Sentinel.meet" }] }),
  component: MemoryPage,
});

type Meeting = { id: string; title: string; host_id: string; created_at: string; ended_at: string | null; status: string };
type Segment = { id: string; speaker_name: string | null; content: string; started_at_ms: number };
type Summary = {
  title: string | null;
  summary: string;
  topics: string[];
  decisions: string[];
  chapters: { label: string; timestamp_ms: number }[];
  duration_seconds: number | null;
  generated_at: string;
};
type Action = { id: string; assignee_name: string; task: string; deadline: string | null; status: string; source_timestamp_ms: number | null };

function fmt(ms: number) {
  const s = Math.floor((ms ?? 0) / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}

function MemoryPage() {
  const { user } = Route.useRouteContext();
  const { id: meetingId } = Route.useParams();
  const router = useRouter();
  const summarize = useServerFn(generateMeetingSummary);
  const ask = useServerFn(askMeetingMemory);

  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [actions, setActions] = useState<Action[]>([]);
  const [query, setQuery] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loading, setLoading] = useState(true);

  const isHost = meeting?.host_id === user.id;

  const load = async () => {
    const [{ data: m }, { data: segs }, { data: sum }, { data: acts }] = await Promise.all([
      supabase.from("meetings").select("id, title, host_id, created_at, ended_at, status").eq("id", meetingId).maybeSingle(),
      supabase.from("meeting_transcripts").select("id, speaker_name, content, started_at_ms").eq("meeting_id", meetingId).order("started_at_ms", { ascending: true }).limit(2000),
      supabase.from("meeting_summaries").select("title, summary, topics, decisions, chapters, duration_seconds, generated_at").eq("meeting_id", meetingId).maybeSingle(),
      supabase.from("meeting_action_items").select("id, assignee_name, task, deadline, status, source_timestamp_ms").eq("meeting_id", meetingId).order("created_at", { ascending: true }),
    ]);
    if (!m) {
      toast.error("Meeting not found or no access");
      router.navigate({ to: "/dashboard" });
      return;
    }
    setMeeting(m as Meeting);
    setSegments((segs as Segment[]) ?? []);
    setSummary((sum as Summary) ?? null);
    setActions((acts as Action[]) ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [meetingId]);

  const filtered = useMemo(() => {
    if (!query.trim()) return segments;
    const q = query.toLowerCase();
    return segments.filter((s) => s.content.toLowerCase().includes(q));
  }, [segments, query]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      await summarize({ data: { meetingId } });
      toast.success("Summary generated");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = question.trim();
    if (!q) return;
    setAsking(true);
    setAnswer(null);
    try {
      const { answer } = await ask({ data: { meetingId, question: q } });
      setAnswer(answer);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not ask");
    } finally {
      setAsking(false);
    }
  };

  const toggleAction = async (a: Action) => {
    if (!isHost) return;
    const next = a.status === "done" ? "open" : "done";
    setActions((prev) => prev.map((x) => (x.id === a.id ? { ...x, status: next } : x)));
    await supabase.from("meeting_action_items").update({ status: next }).eq("id", a.id);
  };

  if (loading) {
    return <div className="max-w-5xl mx-auto px-6 py-16 text-sm text-muted-foreground">Loading meeting memory…</div>;
  }

  const durationLabel = summary?.duration_seconds
    ? `${Math.floor(summary.duration_seconds / 60)} min`
    : segments.length > 0
    ? `${Math.floor((segments[segments.length - 1].started_at_ms) / 60000)} min`
    : "—";

  return (
    <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link to="/dashboard"><ArrowLeft className="size-4" /> Dashboard</Link>
        </Button>
        <span className="text-xs font-mono text-muted-foreground">/ memory</span>
      </div>

      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-mono uppercase tracking-widest text-primary flex items-center gap-1.5">
            <BookOpenText className="size-3.5" /> AI Meeting Memory
          </p>
          <h1 className="text-3xl font-semibold tracking-tight mt-1">{summary?.title || meeting?.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {new Date(meeting!.created_at).toLocaleString()} · {durationLabel} · {segments.length} spoken segments
          </p>
        </div>
        {isHost && (
          <Button onClick={handleGenerate} disabled={generating}>
            <Wand2 className="size-4" />
            {generating ? "Generating…" : summary ? "Regenerate summary" : "Generate AI summary"}
          </Button>
        )}
      </header>

      <div className="grid lg:grid-cols-[1fr_360px] gap-6">
        <div className="space-y-6 min-w-0">
          {/* Summary */}
          <Card className="p-6 bg-surface border-border/60 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="font-semibold">Summary</h2>
              {summary && <span className="text-[10px] font-mono text-muted-foreground ml-auto">Generated {new Date(summary.generated_at).toLocaleString()}</span>}
            </div>
            {summary ? (
              <>
                <div className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">{summary.summary}</div>
                {summary.topics?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-2">
                    {summary.topics.map((t, i) => (
                      <span key={i} className="text-xs font-mono px-2 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary">{t}</span>
                    ))}
                  </div>
                )}
                {summary.decisions?.length > 0 && (
                  <div className="pt-2">
                    <p className="text-xs font-mono uppercase text-muted-foreground mb-2">Final decisions</p>
                    <ul className="space-y-1 text-sm">
                      {summary.decisions.map((d, i) => (
                        <li key={i} className="flex gap-2"><CheckCircle2 className="size-4 text-success shrink-0 mt-0.5" /> {d}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                {isHost
                  ? "No summary yet. Click \"Generate AI summary\" to turn the transcript into topics, decisions, and action items."
                  : "The host hasn't generated a summary yet."}
              </p>
            )}
          </Card>

          {/* Timeline + search */}
          <Card className="p-6 bg-surface border-border/60 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Clock className="size-4 text-primary" />
              <h2 className="font-semibold">Searchable transcript</h2>
              <div className="ml-auto relative w-full sm:w-64">
                <Search className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="pl-8 h-8" />
              </div>
            </div>
            {summary?.chapters && summary.chapters.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {summary.chapters.map((c, i) => (
                  <span key={i} className="text-[11px] font-mono px-2 py-1 rounded border border-border/60 bg-secondary/50">
                    {fmt(c.timestamp_ms)} · {c.label}
                  </span>
                ))}
              </div>
            )}
            <ScrollArea className="h-[420px] pr-2">
              {filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground py-12 text-center">
                  {segments.length === 0 ? "No speech was captured." : "No segments match your search."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {filtered.map((s) => (
                    <li key={s.id} className="text-sm">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[10px] font-mono text-primary tabular-nums">{fmt(s.started_at_ms)}</span>
                        <span className="text-xs font-medium">{s.speaker_name ?? "Speaker"}</span>
                      </div>
                      <p className="mt-0.5 text-foreground/90 leading-relaxed">
                        {highlight(s.content, query)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </ScrollArea>
          </Card>

          {/* Q&A */}
          <Card className="p-6 bg-surface border-border/60 space-y-3">
            <div className="flex items-center gap-2">
              <MessageSquareQuote className="size-4 text-primary" />
              <h2 className="font-semibold">Ask this meeting</h2>
            </div>
            <form onSubmit={handleAsk} className="flex gap-2">
              <Input
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder='e.g. "What did we decide about authentication?"'
                disabled={asking}
              />
              <Button type="submit" disabled={asking || !question.trim()}>
                {asking ? "Thinking…" : "Ask"}
              </Button>
            </form>
            {answer && (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm whitespace-pre-wrap leading-relaxed">
                {answer}
              </div>
            )}
          </Card>
        </div>

        {/* Action items */}
        <Card className="p-5 bg-surface border-border/60 space-y-3 h-fit lg:sticky lg:top-6">
          <div className="flex items-center gap-2">
            <ListChecks className="size-4 text-primary" />
            <h2 className="font-semibold">Action items</h2>
            <span className="ml-auto text-[10px] font-mono text-muted-foreground">{actions.length}</span>
          </div>
          {actions.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tasks extracted yet.</p>
          ) : (
            <ul className="space-y-2">
              {actions.map((a) => (
                <li key={a.id} className="text-sm flex items-start gap-2">
                  <button
                    onClick={() => toggleAction(a)}
                    disabled={!isHost}
                    className="mt-0.5 shrink-0"
                    title={isHost ? "Toggle done" : "Only host can edit"}
                  >
                    {a.status === "done" ? (
                      <CheckCircle2 className="size-4 text-success" />
                    ) : (
                      <Circle className="size-4 text-muted-foreground" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className={a.status === "done" ? "line-through text-muted-foreground" : ""}>{a.task}</p>
                    <p className="text-[10px] font-mono text-muted-foreground mt-0.5">
                      {a.assignee_name}{a.deadline ? ` · due ${a.deadline}` : ""}{a.source_timestamp_ms != null ? ` · ${fmt(a.source_timestamp_ms)}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function highlight(text: string, query: string) {
  if (!query.trim()) return text;
  const q = query.trim();
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-primary/30 text-foreground rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}
