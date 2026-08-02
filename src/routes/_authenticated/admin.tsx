import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShieldCheck, Ban, Trash2, StopCircle, AlertTriangle, Crown, Video, UserCheck, X, Building2, Layers, Plus } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { SecurityAuditPanel } from "@/components/SecurityAuditPanel";
import {
  adminListUsers,
  adminSetBlacklist,
  adminSetRole,
  adminListPending,
  adminApproveUser,
  adminRejectUser,
  adminListMeetings,
  adminEndMeeting,
  adminDeleteMeeting,
  adminListAbuse,
  listDepartments,
  createDepartment,
  deleteDepartment,
  listSections,
  createSection,
  deleteSection,
} from "@/lib/admin.functions";

type Role = "admin" | "deo" | "hod" | "faculty" | "student";
const ROLE_LABEL: Record<Role, string> = { admin: "Admin", deo: "DEO", hod: "HOD", faculty: "Faculty", student: "Student" };

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({ meta: [{ title: "Admin console · Sentinel.meet" }] }),
  beforeLoad: async ({ context }) => {
    const uid = (context as any).user.id;
    const [{ data: a }, { data: d }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: uid, _role: "admin" }),
      supabase.rpc("has_role", { _user_id: uid, _role: "deo" }),
    ]);
    if (!a && !d) throw redirect({ to: "/dashboard" });
    return { isSuperAdmin: !!a };
  },
  component: AdminPage,
});

function AdminPage() {
  const { isSuperAdmin } = Route.useRouteContext() as any;
  return (
    <div className="max-w-7xl mx-auto px-6 py-10 space-y-6">
      <header className="flex items-center gap-3">
        <div className="size-10 rounded-md bg-primary/15 grid place-items-center">
          <ShieldCheck className="size-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {isSuperAdmin ? "Admin" : "DEO"} console
          </h1>
          <p className="text-sm text-muted-foreground">
            {isSuperAdmin ? "Super admin — full control." : "Data Entry Officer — institution management."}
          </p>
        </div>
      </header>

      <Tabs defaultValue="pending">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="pending">Pending signups</TabsTrigger>
          <TabsTrigger value="users">Users & roles</TabsTrigger>
          <TabsTrigger value="departments">Departments</TabsTrigger>
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="meetings">Meetings</TabsTrigger>
          <TabsTrigger value="abuse">Abuse incidents</TabsTrigger>
          <TabsTrigger value="audit">Security audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="pending" className="mt-4"><PendingPanel isSuperAdmin={isSuperAdmin} /></TabsContent>
        <TabsContent value="users" className="mt-4"><UsersPanel isSuperAdmin={isSuperAdmin} /></TabsContent>
        <TabsContent value="departments" className="mt-4"><DepartmentsPanel /></TabsContent>
        <TabsContent value="sections" className="mt-4"><SectionsPanel /></TabsContent>
        <TabsContent value="meetings" className="mt-4"><MeetingsPanel /></TabsContent>
        <TabsContent value="abuse" className="mt-4"><AbusePanel /></TabsContent>
        <TabsContent value="audit" className="mt-4"><SecurityAuditPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

/* ---------------- Pending ---------------- */
function PendingPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const list = useServerFn(adminListPending);
  const approve = useServerFn(adminApproveUser);
  const reject = useServerFn(adminRejectUser);
  const listSec = useServerFn(listSections);
  const listDep = useServerFn(listDepartments);
  const [items, setItems] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [depts, setDepts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () =>
    Promise.all([list(), listSec({ data: {} as any }).catch(() => []), listDep()]).then(([u, s, d]) => {
      setItems(u as any[]); setSections(s as any[]); setDepts(d as any[]); setLoading(false);
    }).catch((e) => { toast.error(friendlyError(e)); setLoading(false); });

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const [choices, setChoices] = useState<Record<string, { role: Role; deptId?: string; sectionId?: string }>>({});

  const doApprove = async (u: any) => {
    const c = choices[u.id] ?? { role: "student" as Role };
    try {
      await approve({ data: { userId: u.id, role: c.role, departmentId: c.deptId ?? null, sectionId: c.sectionId ?? null } });
      toast.success(`Approved @${u.handle}`);
      refresh();
    } catch (e: any) { toast.error(friendlyError(e)); }
  };
  const doReject = async (u: any) => {
    if (!confirm(`Reject @${u.handle}?`)) return;
    try { await reject({ data: { userId: u.id } }); toast.success("Rejected"); refresh(); }
    catch (e: any) { toast.error(friendlyError(e)); }
  };

  if (loading) return <Card className="p-6 text-sm text-muted-foreground">Loading pending sign-ups…</Card>;
  if (items.length === 0) return <Card className="p-6 text-sm text-muted-foreground">No pending sign-ups.</Card>;

  return (
    <Card className="bg-surface border-border/60 divide-y divide-border/60">
      {items.map((u) => {
        const c = choices[u.id] ?? { role: "student" as Role };
        const sectionOptions = sections.filter((s) => !c.deptId || s.department_id === c.deptId);
        return (
          <div key={u.id} className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="size-9 rounded-full bg-secondary grid place-items-center text-xs font-mono">
                {u.display_name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{u.display_name} <span className="text-xs font-mono text-muted-foreground">@{u.handle}</span></div>
                <p className="text-xs text-muted-foreground">Signed up {new Date(u.created_at).toLocaleString()}</p>
              </div>
              <Badge variant="outline" className="text-[10px]">pending</Badge>
            </div>
            <div className="grid sm:grid-cols-4 gap-2">
              <Select value={c.role} onValueChange={(v) => setChoices({ ...choices, [u.id]: { ...c, role: v as Role } })}>
                <SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="faculty">Faculty</SelectItem>
                  <SelectItem value="hod">HOD</SelectItem>
                  {isSuperAdmin && <SelectItem value="deo">DEO</SelectItem>}
                  {isSuperAdmin && <SelectItem value="admin">Admin</SelectItem>}
                </SelectContent>
              </Select>
              <Select value={c.deptId ?? ""} onValueChange={(v) => setChoices({ ...choices, [u.id]: { ...c, deptId: v, sectionId: undefined } })}>
                <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
                <SelectContent>
                  {depts.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
                </SelectContent>
              </Select>
              {(c.role === "student" || c.role === "faculty") ? (
                <Select value={c.sectionId ?? ""} onValueChange={(v) => setChoices({ ...choices, [u.id]: { ...c, sectionId: v } })}>
                  <SelectTrigger><SelectValue placeholder="Section (optional)" /></SelectTrigger>
                  <SelectContent>
                    {sectionOptions.map((s) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
                  </SelectContent>
                </Select>
              ) : <div />}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => doApprove(u)} className="flex-1"><UserCheck className="size-3.5" /> Approve</Button>
                <Button size="sm" variant="destructive" onClick={() => doReject(u)}><X className="size-3.5" /></Button>
              </div>
            </div>
          </div>
        );
      })}
    </Card>
  );
}

/* ---------------- Users ---------------- */
function UsersPanel({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const list = useServerFn(adminListUsers);
  const setBl = useServerFn(adminSetBlacklist);
  const setRole = useServerFn(adminSetRole);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const refresh = () => list().then((d) => { setUsers(d as any[]); setLoading(false); }).catch((e) => { toast.error(friendlyError(e)); setLoading(false); });
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const toggleBlacklist = async (u: any) => {
    try { await setBl({ data: { userId: u.id, blacklist: !u.is_blacklisted } }); toast.success(u.is_blacklisted ? "Unblocked" : "Blacklisted"); refresh(); }
    catch (e: any) { toast.error(friendlyError(e)); }
  };
  const changeRole = async (u: any, role: Role) => {
    try { await setRole({ data: { userId: u.id, role } }); toast.success(`Set @${u.handle} → ${ROLE_LABEL[role]}`); refresh(); }
    catch (e: any) { toast.error(friendlyError(e)); }
  };

  const filtered = users.filter((u) => {
    if (u.status === "pending") return false;
    if (!q) return true;
    const s = q.toLowerCase();
    return u.handle.toLowerCase().includes(s) || u.display_name.toLowerCase().includes(s);
  });

  if (loading) return <Card className="p-6 text-sm text-muted-foreground">Loading users…</Card>;
  return (
    <div className="space-y-3">
      <Input placeholder="Search @handle or name" value={q} onChange={(e) => setQ(e.target.value)} />
      <Card className="bg-surface border-border/60 divide-y divide-border/60">
        {filtered.map((u) => {
          const primary = (u.roles[0] as Role) ?? "student";
          return (
            <div key={u.id} className="flex items-center gap-3 p-4 flex-wrap">
              <div className="size-9 rounded-full bg-secondary grid place-items-center text-xs font-mono">
                {u.display_name?.[0]?.toUpperCase() ?? "?"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium truncate">{u.display_name}</span>
                  <span className="text-xs font-mono text-muted-foreground">@{u.handle}</span>
                  {u.is_blacklisted && <Badge variant="destructive" className="text-[10px]">blacklisted</Badge>}
                  {u.status === "rejected" && <Badge variant="outline" className="text-[10px]">rejected</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">Reputation {u.reputation}</p>
              </div>
              <Select value={primary} onValueChange={(v) => changeRole(u, v as Role)}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="student">Student</SelectItem>
                  <SelectItem value="faculty">Faculty</SelectItem>
                  <SelectItem value="hod">HOD</SelectItem>
                  {isSuperAdmin && <SelectItem value="deo">DEO</SelectItem>}
                  {isSuperAdmin && <SelectItem value="admin">Admin</SelectItem>}
                </SelectContent>
              </Select>
              <Button size="sm" variant={u.is_blacklisted ? "outline" : "destructive"} onClick={() => toggleBlacklist(u)}>
                <Ban className="size-3.5" /> {u.is_blacklisted ? "Unblock" : "Blacklist"}
              </Button>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="p-6 text-sm text-muted-foreground">No users.</div>}
      </Card>
    </div>
  );
}

/* ---------------- Departments ---------------- */
function DepartmentsPanel() {
  const list = useServerFn(listDepartments);
  const create = useServerFn(createDepartment);
  const del = useServerFn(deleteDepartment);
  const listU = useServerFn(adminListUsers);
  const [depts, setDepts] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [name, setName] = useState(""); const [code, setCode] = useState(""); const [hodId, setHodId] = useState("");

  const refresh = () => Promise.all([list(), listU()]).then(([d, u]) => { setDepts(d as any[]); setUsers(u as any[]); }).catch((e) => toast.error(friendlyError(e)));
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const hodCandidates = users.filter((u) => (u.roles ?? []).includes("hod"));

  const doCreate = async () => {
    if (!name.trim() || !code.trim()) return toast.error("Name and code required");
    try { await create({ data: { name, code, hodId: hodId || null } }); toast.success("Department created"); setName(""); setCode(""); setHodId(""); refresh(); }
    catch (e: any) { toast.error(friendlyError(e)); }
  };
  const doDelete = async (d: any) => {
    if (!confirm(`Delete department ${d.name}? All its sections and data will be removed.`)) return;
    try { await del({ data: { departmentId: d.id } }); toast.success("Deleted"); refresh(); }
    catch (e: any) { toast.error(friendlyError(e)); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-surface border-border/60 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2"><Plus className="size-4" /> New department</p>
        <div className="grid sm:grid-cols-4 gap-2">
          <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Code (e.g. CSE)" value={code} onChange={(e) => setCode(e.target.value)} />
          <Select value={hodId} onValueChange={setHodId}>
            <SelectTrigger><SelectValue placeholder="Assign HOD (optional)" /></SelectTrigger>
            <SelectContent>
              {hodCandidates.map((u) => (<SelectItem key={u.id} value={u.id}>@{u.handle}</SelectItem>))}
            </SelectContent>
          </Select>
          <Button onClick={doCreate}>Create</Button>
        </div>
      </Card>
      <Card className="bg-surface border-border/60 divide-y divide-border/60">
        {depts.map((d) => (
          <div key={d.id} className="flex items-center gap-3 p-4">
            <Building2 className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">{d.name} <span className="text-xs font-mono text-muted-foreground">{d.code}</span></div>
              {d.hod_id && <p className="text-xs text-muted-foreground">HOD: @{users.find((u) => u.id === d.hod_id)?.handle ?? d.hod_id.slice(0, 8)}</p>}
            </div>
            <Button size="sm" variant="destructive" onClick={() => doDelete(d)}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
        {depts.length === 0 && <div className="p-6 text-sm text-muted-foreground">No departments yet.</div>}
      </Card>
    </div>
  );
}

/* ---------------- Sections ---------------- */
function SectionsPanel() {
  const list = useServerFn(listSections);
  const listD = useServerFn(listDepartments);
  const create = useServerFn(createSection);
  const del = useServerFn(deleteSection);
  const [depts, setDepts] = useState<any[]>([]);
  const [sections, setSections] = useState<any[]>([]);
  const [name, setName] = useState(""); const [deptId, setDeptId] = useState(""); const [slots, setSlots] = useState(7);

  const refresh = () => Promise.all([list({ data: {} as any }), listD()]).then(([s, d]) => { setSections(s as any[]); setDepts(d as any[]); }).catch((e) => toast.error(friendlyError(e)));
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const doCreate = async () => {
    if (!name.trim() || !deptId) return toast.error("Name and department required");
    try { await create({ data: { name, departmentId: deptId, slotCount: slots } }); toast.success("Section created"); setName(""); refresh(); }
    catch (e: any) { toast.error(friendlyError(e)); }
  };
  const doDelete = async (s: any) => {
    if (!confirm(`Delete section ${s.name}?`)) return;
    try { await del({ data: { sectionId: s.id } }); toast.success("Deleted"); refresh(); }
    catch (e: any) { toast.error(friendlyError(e)); }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 bg-surface border-border/60 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2"><Plus className="size-4" /> New section</p>
        <div className="grid sm:grid-cols-4 gap-2">
          <Input placeholder="Section name (e.g. CSE-A)" value={name} onChange={(e) => setName(e.target.value)} />
          <Select value={deptId} onValueChange={setDeptId}>
            <SelectTrigger><SelectValue placeholder="Department" /></SelectTrigger>
            <SelectContent>
              {depts.map((d) => (<SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>))}
            </SelectContent>
          </Select>
          <Input type="number" min={1} max={12} value={slots} onChange={(e) => setSlots(parseInt(e.target.value) || 7)} placeholder="Daily slots (7)" />
          <Button onClick={doCreate}>Create</Button>
        </div>
      </Card>
      <Card className="bg-surface border-border/60 divide-y divide-border/60">
        {sections.map((s) => (
          <div key={s.id} className="flex items-center gap-3 p-4">
            <Layers className="size-4 text-muted-foreground" />
            <div className="flex-1">
              <div className="font-medium">{s.name}</div>
              <p className="text-xs text-muted-foreground">{depts.find((d) => d.id === s.department_id)?.name ?? "—"} · {s.slot_count} slots/day</p>
            </div>
            <Button size="sm" variant="destructive" onClick={() => doDelete(s)}><Trash2 className="size-3.5" /></Button>
          </div>
        ))}
        {sections.length === 0 && <div className="p-6 text-sm text-muted-foreground">No sections yet.</div>}
      </Card>
    </div>
  );
}

/* ---------------- Meetings ---------------- */
function MeetingsPanel() {
  const list = useServerFn(adminListMeetings);
  const end = useServerFn(adminEndMeeting);
  const del = useServerFn(adminDeleteMeeting);
  const [meetings, setMeetings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = () => list().then((d) => { setMeetings(d as any[]); setLoading(false); }).catch((e) => { toast.error(friendlyError(e)); setLoading(false); });
  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  const endMeeting = async (m: any) => {
    try { await end({ data: { meetingId: m.id } }); toast.success("Meeting ended"); refresh(); }
    catch (e: any) { toast.error(friendlyError(e)); }
  };
  const deleteMeeting = async (m: any) => {
    if (!confirm(`Permanently delete "${m.title}" and all related data?`)) return;
    try { await del({ data: { meetingId: m.id } }); toast.success("Meeting deleted"); refresh(); }
    catch (e: any) { toast.error(friendlyError(e)); }
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

/* ---------------- Abuse ---------------- */
function AbusePanel() {
  const list = useServerFn(adminListAbuse);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { list().then((d) => { setItems(d as any[]); setLoading(false); }).catch((e) => { toast.error(friendlyError(e)); setLoading(false); }); /* eslint-disable-next-line */ }, []);

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
