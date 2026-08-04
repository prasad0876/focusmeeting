import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Inbox, Check, X } from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";

export const Route = createFileRoute("/_authenticated/invitations")({
  head: () => ({ meta: [{ title: "Invitations · Sentinel.meet" }] }),
  component: Invitations,
});

type Row = {
  id: string;
  status: string;
  created_at: string;
  inviter_id: string;
  meeting: { id: string; title: string; description: string | null; status: string; host_id: string } | null;
  inviter: { handle: string; display_name: string } | null;
};

function Invitations() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const { data: invites, error } = await supabase
      .from("meeting_invitations")
      .select(`
        id, status, created_at, inviter_id,
        meeting:meetings(id, title, description, status, host_id)
      `)
      .eq("invitee_id", user.id)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error(friendlyError(error));
      setLoading(false);
      return;
    }

    const inviterIds = Array.from(new Set((invites ?? []).map((r: any) => r.inviter_id).filter(Boolean)));
    const profilesById: Record<string, { handle: string; display_name: string }> = {};
    if (inviterIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, handle, display_name")
        .in("id", inviterIds);
      (profs ?? []).forEach((p: any) => {
        profilesById[p.id] = { handle: p.handle, display_name: p.display_name };
      });
    }

    const enriched: Row[] = (invites ?? []).map((r: any) => ({
      id: r.id,
      status: r.status,
      created_at: r.created_at,
      inviter_id: r.inviter_id,
      meeting: r.meeting ?? null,
      inviter: profilesById[r.inviter_id] ?? null,
    }));
    setRows(enriched);
    setLoading(false);
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("invites:" + user.id)
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_invitations", filter: `invitee_id=eq.${user.id}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "meetings" }, () => load())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  const respond = async (row: Row, status: "accepted" | "declined") => {
    const { error } = await supabase
      .from("meeting_invitations")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("id", row.id);
    if (error) {
      toast.error(friendlyError(error));
      return;
    }
    if (status === "accepted" && row.meeting) {
      router.navigate({ to: "/meeting/$id", params: { id: row.meeting.id } });
    } else {
      toast.success(status === "accepted" ? "Accepted" : "Declined");
      load();
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Invitations</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Direct, verified invitations from other Sentinel users.
      </p>

      <div className="mt-8 space-y-3">
        {loading ? (
          <Card className="p-10 bg-surface border-border/60">
            <p className="text-sm text-muted-foreground text-center">Loading…</p>
          </Card>
        ) : rows.length === 0 ? (
          <Card className="p-12 border-dashed border-border/60 bg-transparent text-center">
            <Inbox className="size-8 mx-auto text-muted-foreground/60" />
            <p className="mt-3 text-sm text-muted-foreground">No invitations yet.</p>
          </Card>
        ) : (
          rows.map((r) => (
            <Card key={r.id} className="p-5 bg-surface border-border/60 flex items-start gap-4 flex-wrap">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium">{r.meeting?.title ?? "(meeting)"}</h3>
                  <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded border border-border/60 bg-secondary/60">
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  From <span className="font-mono text-foreground">@{r.inviter?.handle}</span>
                  {" · "}{new Date(r.created_at).toLocaleString()}
                </p>
                {r.meeting?.description && (
                  <p className="text-sm text-muted-foreground line-clamp-2 pt-1">{r.meeting.description}</p>
                )}
              </div>
              <div className="flex gap-2">
                {r.status === "pending" ? (
                  <>
                    <Button size="sm" onClick={() => respond(r, "accepted")}>
                      <Check className="size-4" /> Accept
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => respond(r, "declined")}>
                      <X className="size-4" /> Decline
                    </Button>
                  </>
                ) : r.status === "accepted" && r.meeting ? (
                  <Button asChild size="sm" variant="secondary">
                    <Link to="/meeting/$id" params={{ id: r.meeting.id }}>
                      Enter room
                    </Link>
                  </Button>
                ) : null}
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
