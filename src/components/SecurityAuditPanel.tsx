import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import {
  listAuditEntries,
  createAuditEntry,
  updateAuditEntryStatus,
  deleteAuditEntry,
} from "@/lib/audit.functions";

const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const STATUSES = ["open", "fixed", "ignored", "accepted_risk"] as const;

const SEV_STYLE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/15 text-primary",
  high: "bg-warning/15 text-warning",
  critical: "bg-destructive/15 text-destructive",
};
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  fixed: "Fixed",
  ignored: "Ignored",
  accepted_risk: "Accepted risk",
};

type Entry = {
  id: string;
  internal_id: string;
  scanner_name: string | null;
  severity: string;
  category: string | null;
  title: string;
  description: string | null;
  status: string;
  remediation: string | null;
  files_changed: string[] | null;
  migration_notes: string | null;
  resolved_at: string | null;
  created_at: string;
};

export function SecurityAuditPanel() {
  const list = useServerFn(listAuditEntries);
  const create = useServerFn(createAuditEntry);
  const setStatus = useServerFn(updateAuditEntryStatus);
  const remove = useServerFn(deleteAuditEntry);

  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    internal_id: "",
    scanner_name: "",
    severity: "medium",
    category: "",
    title: "",
    description: "",
    status: "fixed",
    remediation: "",
    files_changed: "",
    migration_notes: "",
  });

  const refresh = () =>
    list()
      .then((d) => {
        setItems(d as Entry[]);
        setLoading(false);
      })
      .catch((e) => {
        toast.error(friendlyError(e));
        setLoading(false);
      });

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((i) =>
      [i.internal_id, i.title, i.category, i.remediation, (i.files_changed ?? []).join(" ")]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(needle)),
    );
  }, [items, q]);

  const submit = async () => {
    try {
      await create({
        data: {
          ...form,
          files_changed: form.files_changed
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        },
      });
      toast.success("Audit entry recorded");
      setShowForm(false);
      setForm({ ...form, internal_id: "", title: "", description: "", remediation: "", files_changed: "", migration_notes: "", category: "" });
      refresh();
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  };

  const changeStatus = async (id: string, status: string) => {
    try {
      await setStatus({ data: { id, status } });
      refresh();
    } catch (e: any) {
      toast.error(friendlyError(e));
    }
  };

  const doDelete = async (e: Entry) => {
    if (!confirm(`Delete audit entry "${e.internal_id}"?`)) return;
    try {
      await remove({ data: { id: e.id } });
      toast.success("Entry deleted");
      refresh();
    } catch (err: any) {
      toast.error(friendlyError(err));
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by finding ID, title, file…"
            className="pl-9"
          />
        </div>
        <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? "secondary" : "default"}>
          <Plus className="size-4 mr-1" /> Record entry
        </Button>
      </div>

      {showForm && (
        <Card className="bg-surface border-border/60 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input placeholder="internal_id (e.g. profile_self_escalation)" value={form.internal_id} onChange={(e) => setForm({ ...form, internal_id: e.target.value })} />
            <Input placeholder="Scanner name (optional)" value={form.scanner_name} onChange={(e) => setForm({ ...form, scanner_name: e.target.value })} />
            <Input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <Input placeholder="Category (e.g. RLS, dependency)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
            <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
              <SelectTrigger><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>{SEVERITIES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <textarea
            className="w-full rounded-md border border-border/60 bg-background p-3 text-sm min-h-20"
            placeholder="Finding description — what the scanner reported"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <textarea
            className="w-full rounded-md border border-border/60 bg-background p-3 text-sm min-h-20"
            placeholder="Remediation — the exact code/config change that addressed it"
            value={form.remediation}
            onChange={(e) => setForm({ ...form, remediation: e.target.value })}
          />
          <textarea
            className="w-full rounded-md border border-border/60 bg-background p-3 text-sm min-h-16"
            placeholder="Files changed (comma or newline separated)"
            value={form.files_changed}
            onChange={(e) => setForm({ ...form, files_changed: e.target.value })}
          />
          <textarea
            className="w-full rounded-md border border-border/60 bg-background p-3 text-sm min-h-16"
            placeholder="Database / config notes (policies, triggers, grants)"
            value={form.migration_notes}
            onChange={(e) => setForm({ ...form, migration_notes: e.target.value })}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button onClick={submit}>Save entry</Button>
          </div>
        </Card>
      )}

      {loading ? (
        <Card className="p-6 text-sm text-muted-foreground">Loading audit log…</Card>
      ) : filtered.length === 0 ? (
        <Card className="p-6 text-sm text-muted-foreground flex items-center gap-2">
          <FileText className="size-4" /> No audit entries yet.
        </Card>
      ) : (
        <Card className="bg-surface border-border/60 divide-y divide-border/60">
          {filtered.map((e) => (
            <div key={e.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-xs font-mono px-2 py-0.5 rounded bg-secondary">{e.internal_id}</code>
                <Badge className={SEV_STYLE[e.severity] ?? SEV_STYLE.medium}>{e.severity}</Badge>
                {e.category && <span className="text-xs text-muted-foreground">{e.category}</span>}
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </div>
              <div className="font-medium text-sm">{e.title}</div>
              {e.description && <p className="text-sm text-muted-foreground">{e.description}</p>}
              {e.remediation && (
                <p className="text-sm">
                  <span className="text-muted-foreground">Fix: </span>
                  {e.remediation}
                </p>
              )}
              {e.migration_notes && (
                <p className="text-xs text-muted-foreground">DB/config: {e.migration_notes}</p>
              )}
              {(e.files_changed ?? []).length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {(e.files_changed ?? []).map((f) => (
                    <code key={f} className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-secondary/60">{f}</code>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-2 pt-1">
                <Select value={e.status} onValueChange={(v) => changeStatus(e.id, v)}>
                  <SelectTrigger className="h-8 w-[160px] text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                </Select>
                {e.resolved_at && (
                  <span className="text-xs text-muted-foreground">resolved {new Date(e.resolved_at).toLocaleDateString()}</span>
                )}
                <Button size="sm" variant="ghost" className="ml-auto text-destructive" onClick={() => doDelete(e)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
