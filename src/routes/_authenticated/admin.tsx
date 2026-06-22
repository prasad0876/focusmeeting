import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Ban, Trash2, StopCircle, UserMinus, AlertTriangle, Crown, Video } from "lucide-react";
import { toast } from "sonner";
import {
  adminListUsers,
  adminSetBlacklist,
  adminSetRole,
  adminListMeetings,
  adminEndMeeting,
  adminDeleteMeeting,
  adminListAbuse,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin · Sentinel.meet" }] }),
  beforeLoad: async ({ context }) => {
    const { data } = await supabase.rpc("has_role", {
      _user_id: (context as any).user.id,
      _role: "admin",
    });
    if (!data) throw redirect({ to: "/dashboard" });
  },
  component: AdminPage,
});

function AdminPage() {
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
      <header className="flex items-center gap-3">
        <div className="size-10 rounded-md bg-primary/15 grid place-items-center">
          <ShieldCheck className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Admin console</h1>
          <p className="text-sm text-muted-foreground">Privileged controls. Use with care.</p>
        </div>
      </header>

      <Tabs defaultValue="users">
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="abuse">Abuse incidents</TabsTrigger>
        </TabsList>
        <TabsContent value="users" className="mt-4"><UsersPanel /></TabsContent>
        <TabsContent value="meetings" className="mt-4"><MeetingsPanel /></TabsContent>
        <TabsContent value="abuse" className="mt-4"><AbusePanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function UsersPanel() {
  const list = useServerFn(adminListUsers);
  const setBl = useServerFn(adminSetBlacklist);
  const setRole = useServerFn(adminSetRole);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => list().then((d) => { setUsers(d as any[]); setLoading(false); }).catch((e) => { toast.error(e.message); setLoading(false); });
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const toggleBlacklist = async (u: any) => {
    try { await setBl({ data: { userId: u.id, blacklist: !u.is_blacklisted } }); toast.success(u.is_blacklisted ? "Unblocked" : "Blacklisted"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const toggleAdmin = async (u: any) => {
    const isAdmin = u.roles.includes("admin");
    try { await setRole({ data: { userId: u.id, grant: !isAdmin } }); toast.success(isAdmin ? "Admin revoked" : "Admin granted"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <Card className="p-6 text-sm text-muted-foreground">Loading users…</Card>;
  return (
    <Card className="bg-surface border-border/60 divide-y divide-border/60">
      {users.map((u) => (
        <div key={u.id} className="flex items-center gap-3 p-4">
          <div className="size-9 rounded-full bg-secondary grid place-items-center text-xs font-mono">
            {u.display_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium truncate">{u.display_name}</span>
              <span className="text-xs font-mono text-muted-foreground">@{u.handle}</span>
              {u.roles.includes("admin") && <Badge variant="secondary" className="text-[10px]"><Crown className="size-3 mr-1" /> admin</Badge>}
              {u.is_blacklisted && <Badge variant="destructive" className="text-[10px]">blacklisted</Badge>}
            </div>
            <p className="text-xs text-muted-foreground">Reputation {u.reputation}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => toggleAdmin(u)}>
            <Crown className="size-3.5" /> {u.roles.includes("admin") ? "Revoke" : "Make admin"}
          </Button>
          <Button size="sm" variant={u.is_blacklisted ? "outline" : "destructive"} onClick={() => toggleBlacklist(u)}>
            <Ban className="size-3.5" /> {u.is_blacklisted ? "Unblock" : "Blacklist"}
          </Button>
        </div>
      ))}
      {users.length === 0 && <div className="p-6 text-sm text-muted-foreground">No users.</div>}
    </Card>
  );
}

function MeetingsPanel() {
  const list = useServerFn(adminListMeetings);
  const end = useServerFn(adminEndMeeting);
  const del = useServerFn(adminDeleteMeeting);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => list().then((d) => { setMeetings(d as any[]); setLoading(false); }).catch((e) => { toast.error(e.message); setLoading(false); });
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const endMeeting = async (m: any) => {
    try { await end({ data: { meetingId: m.id } }); toast.success("Meeting ended"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };
  const deleteMeeting = async (m: any) => {
    if (!confirm(`Permanently delete "${m.title}" and all related data?`)) return;
    try { await del({ data: { meetingId: m.id } }); toast.success("Meeting deleted"); refresh(); }
    catch (e: any) { toast.error(e.message); }
  };

  if (loading) return <Card className="p-6 text-sm text-muted-foreground">Loading meetings…</Card>;
  return (
    <Card className="bg-surface border-border/60 divide-y divide-border/60">
      {meetings.map((m) => (
        <div key={m.id} className="flex items-center gap-3 p-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium truncate">{m.title}</span>
              <Badge variant={m.status === "live" ? "default" : "secondary"} className="text-[10px] uppercase">{m.status}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Host @{m.host?.handle ?? m.host_id.slice(0, 8)} · {new Date(m.created_at).toLocaleString()}
            </p>
          </div>
          <Button asChild size="sm" variant="ghost"><Link to="/meeting/$id" params={{ id: m.id }}><Video className="size-3.5" /> Open</Link></Button>
          {m.status !== "ended" && (
            <Button size="sm" variant="outline" onClick={() => endMeeting(m)}>
              <StopCircle className="size-3.5" /> End
            </Button>
          )}
          <Button size="sm" variant="destructive" onClick={() => deleteMeeting(m)}>
            <Trash2 className="size-3.5" /> Delete
          </Button>
        </div>
      ))}
      {meetings.length === 0 && <div className="p-6 text-sm text-muted-foreground">No meetings.</div>}
    </Card>
  );
}

function AbusePanel() {
  const list = useServerFn(adminListAbuse);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { list().then((d) => { setItems(d as any[]); setLoading(false); }).catch((e) => { toast.error(e.message); setLoading(false); }); /* eslint-disable-next-line */ }, []);

  if (loading) return <Card className="p-6 text-sm text-muted-foreground">Loading incidents…</Card>;
  if (items.length === 0) return <Card className="p-6 text-sm text-muted-foreground">No abuse incidents reported.</Card>;
  const sevColor: Record<string, string> = {
    low: "bg-muted text-muted-foreground",
    moderate: "bg-warning/20 text-warning",
    high: "bg-destructive/20 text-destructive",
    severe: "bg-destructive text-destructive-foreground",
  };
  return (
    <Card className="bg-surface border-border/60 divide-y divide-border/60">
      {items.map((i) => (
        <div key={i.id} className="p-4 flex gap-3 items-start">
          <AlertTriangle className="size-4 text-warning mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge className={`text-[10px] uppercase ${sevColor[i.severity] ?? ""}`}>{i.severity}</Badge>
              <span className="text-xs font-mono text-muted-foreground">{i.category}</span>
              <span className="text-xs text-muted-foreground">{new Date(i.created_at).toLocaleString()}</span>
            </div>
            {i.excerpt && <p className="text-sm mt-1 line-clamp-2">{i.excerpt}</p>}
            <p className="text-xs text-muted-foreground mt-1">Action: {i.action_taken}</p>
          </div>
          <Button asChild size="sm" variant="ghost"><Link to="/meeting/$id" params={{ id: i.meeting_id }}>Open meeting</Link></Button>
        </div>
      ))}
    </Card>
  );
}
