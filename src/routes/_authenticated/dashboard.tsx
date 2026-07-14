import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Calendar, Inbox, Plus, Video, Copy, Check, CalendarCheck, GraduationCap } from "lucide-react";
import { toast } from "sonner";
import { myAttendance, myGrades } from "@/lib/school.functions";
import { useMyRole } from "@/hooks/use-my-role";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard · Sentinel.meet" }] }),
  component: Dashboard,
});

type Profile = { id: string; handle: string; display_name: string; reputation: number };
type Meeting = { id: string; title: string; status: string; created_at: string; host_id: string };

function Dashboard() {
  const { user } = Route.useRouteContext();
  const { isStudent } = useMyRole(user.id);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [invitationCount, setInvitationCount] = useState(0);
  const [copied, setCopied] = useState(false);
  const [attendance, setAttendance] = useState<any[]>([]);
  const [grades, setGrades] = useState<any[]>([]);
  const attFn = useServerFn(myAttendance);
  const gradeFn = useServerFn(myGrades);

  useEffect(() => {
    if (!isStudent) return;
    attFn().then((r: any) => setAttendance(r)).catch(() => {});
    gradeFn().then((r: any) => setGrades(r)).catch(() => {});
  }, [isStudent]); // eslint-disable-line

  useEffect(() => {
    let active = true;
    (async () => {
      const [{ data: prof }, { data: hosted }, { data: invited }, { count }] = await Promise.all([
        supabase.from("profiles").select("id, handle, display_name, reputation").eq("id", user.id).single(),
        supabase
          .from("meetings")
          .select("id, title, status, created_at, host_id")
          .eq("host_id", user.id)
          .order("created_at", { ascending: false })
          .limit(10),
        supabase
          .from("meeting_invitations")
          .select("meeting:meetings(id, title, status, created_at, host_id)")
          .eq("invitee_id", user.id)
          .eq("status", "accepted")
          .limit(10),
        supabase
          .from("meeting_invitations")
          .select("id", { count: "exact", head: true })
          .eq("invitee_id", user.id)
          .eq("status", "pending"),
      ]);
      if (!active) return;
      setProfile(prof as Profile);
      const invitedMeetings = (invited ?? [])
        .map((r: any) => r.meeting)
        .filter(Boolean) as Meeting[];
      const merged = [...(hosted ?? []), ...invitedMeetings];
      const unique = Array.from(new Map(merged.map((m) => [m.id, m])).values());
      setMeetings(unique);
      setInvitationCount(count ?? 0);
    })();
    return () => {
      active = false;
    };
  }, [user.id]);

  const copyId = () => {
    if (!profile) return;
    navigator.clipboard.writeText(profile.handle);
    setCopied(true);
    toast.success("User ID copied");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-10">
      <section className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-6 bg-surface border-border/60 relative overflow-hidden">
          <div className="absolute inset-0 grid-bg opacity-40 pointer-events-none" />
          <div className="relative space-y-4">
            <p className="text-xs font-mono uppercase tracking-widest text-primary">Your verified User ID</p>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-3xl md:text-4xl font-mono">@{profile?.handle ?? "…"}</span>
              <button
                onClick={copyId}
                className="size-9 grid place-items-center rounded-md bg-secondary/60 hover:bg-secondary border border-border/60"
              >
                {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
              </button>
            </div>
            <p className="text-sm text-muted-foreground max-w-md">
              Share this ID instead of a meeting link. Only verified invites land in your inbox — no public URLs, ever.
            </p>
            <div className="flex gap-2 pt-2">
              <Button asChild>
                <Link to="/new-meeting"><Plus className="size-4" /> New meeting</Link>
              </Button>
              <Button asChild variant="secondary">
                <Link to="/invitations">
                  <Inbox className="size-4" /> Invitations
                  {invitationCount > 0 && (
                    <span className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary text-primary-foreground">
                      {invitationCount}
                    </span>
                  )}
                </Link>
              </Button>
            </div>
          </div>
        </Card>

        <Card className="p-6 bg-surface border-border/60 space-y-4">
          <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground">Reputation</p>
          <div className="flex items-end gap-2">
            <span className="text-5xl font-semibold tabular-nums">{profile?.reputation ?? 100}</span>
            <span className="text-muted-foreground text-sm pb-1.5">/ 100</span>
          </div>
          <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${profile?.reputation ?? 100}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Earned by respectful, focused participation. Lost on abusive behaviour.
          </p>
        </Card>
      </section>

      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold tracking-tight">Recent meetings</h2>
          <span className="text-xs font-mono text-muted-foreground">{meetings.length} total</span>
        </div>
        {meetings.length === 0 ? (
          <Card className="p-10 text-center border-dashed border-border/60 bg-transparent">
            <Calendar className="size-8 mx-auto text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">No meetings yet. Create one to get started.</p>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {meetings.map((m) => (
              <Card key={m.id} className="p-5 bg-surface border-border/60 hover:border-primary/50 transition h-full flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium leading-tight">{m.title}</h3>
                  <StatusPill status={m.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {m.host_id === user.id ? "You hosted" : "Invited"} · {new Date(m.created_at).toLocaleDateString()}
                </p>
                <div className="mt-auto pt-4 flex items-center gap-3 text-xs">
                  <Link to="/meeting/$id" params={{ id: m.id }} className="text-primary flex items-center gap-1 hover:underline">
                    <Video className="size-3.5" /> Enter room
                  </Link>
                  <Link to="/memory/$id" params={{ id: m.id }} className="text-muted-foreground hover:text-foreground flex items-center gap-1 ml-auto">
                    AI memory →
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {isStudent && (
        <section className="grid md:grid-cols-2 gap-4">
          <Card className="p-5 bg-surface border-border/60 space-y-3">
            <div className="flex items-center gap-2"><CalendarCheck className="size-4 text-primary" /><h3 className="font-medium">Recent attendance</h3></div>
            {attendance.length === 0 ? (
              <p className="text-xs text-muted-foreground">No attendance recorded yet.</p>
            ) : (
              <ul className="text-sm divide-y divide-border/60">
                {attendance.slice(0, 8).map((a) => (
                  <li key={a.id} className="py-2 flex items-center justify-between">
                    <span className="text-muted-foreground text-xs">{a.date} · slot {a.slot} · {a.section_name}</span>
                    <span className={`text-xs font-mono uppercase ${a.status === "present" ? "text-success" : a.status === "late" ? "text-warning" : "text-destructive"}`}>{a.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card className="p-5 bg-surface border-border/60 space-y-3">
            <div className="flex items-center gap-2"><GraduationCap className="size-4 text-primary" /><h3 className="font-medium">My marks</h3></div>
            {grades.length === 0 ? (
              <p className="text-xs text-muted-foreground">No marks recorded yet.</p>
            ) : (
              <ul className="text-sm divide-y divide-border/60">
                {grades.slice(0, 8).map((g) => (
                  <li key={g.id} className="py-2 flex items-center justify-between gap-2">
                    <span className="truncate">{g.subject} <span className="text-xs text-muted-foreground">· {g.exam_type}{g.term ? ` · ${g.term}` : ""}</span></span>
                    <span className="text-xs font-mono tabular-nums">{g.marks}/{g.max_marks}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    live: "bg-success/20 text-success border-success/30",
    scheduled: "bg-primary/15 text-primary border-primary/30",
    ended: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={`text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border ${map[status] ?? map.ended}`}>
      {status}
    </span>
  );
}
