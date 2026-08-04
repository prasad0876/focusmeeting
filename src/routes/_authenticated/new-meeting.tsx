import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { X, UserPlus, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/new-meeting")({
  head: () => ({ meta: [{ title: "New meeting · Sentinel.meet" }] }),
  component: NewMeeting,
});

type InvitedUser = { id: string; handle: string; display_name: string };

function NewMeeting() {
  const { user } = Route.useRouteContext();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [invitees, setInvitees] = useState<InvitedUser[]>([]);
  const [handle, setHandle] = useState("");
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const addInvitee = async () => {
    const cleaned = handle.replace(/^@/, "").trim().toLowerCase();
    if (!cleaned) return;
    if (invitees.some((u) => u.handle === cleaned)) {
      toast.error("Already invited");
      return;
    }
    setSearching(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("id, handle, display_name")
      .eq("handle", cleaned)
      .maybeSingle();
    setSearching(false);
    if (error || !data) {
      toast.error("No verified user with that ID");
      return;
    }
    if (data.id === user.id) {
      toast.error("You're already the host");
      return;
    }
    setInvitees((prev) => [...prev, data as InvitedUser]);
    setHandle("");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setCreating(true);
    try {
      const { data: meeting, error } = await supabase
        .from("meetings")
        .insert({
          host_id: user.id,
          title: title.trim(),
          description: description.trim() || null,
          status: "live",
          started_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      if (invitees.length > 0) {
        const rows = invitees.map((u) => ({
          meeting_id: meeting.id,
          invitee_id: u.id,
          inviter_id: user.id,
        }));
        const { error: invErr } = await supabase.from("meeting_invitations").insert(rows);
        if (invErr) throw invErr;
      }
      toast.success("Meeting created. Invitations sent.");
      router.navigate({ to: "/meeting/$id", params: { id: meeting.id } });
    } catch (err: any) {
      toast.error(friendlyError(err, "Could not create meeting"));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Create a meeting</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Invite people directly by their verified User ID. No links are generated.
      </p>

      <form onSubmit={submit} className="mt-8 space-y-6">
        <Card className="p-6 bg-surface border-border/60 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              required
              maxLength={120}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Q4 planning review"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="desc">Description (optional)</Label>
            <Textarea
              id="desc"
              maxLength={500}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Agenda, context…"
              rows={3}
            />
          </div>
        </Card>

        <Card className="p-6 bg-surface border-border/60 space-y-4">
          <div>
            <Label>Invite by User ID</Label>
            <p className="text-xs text-muted-foreground mt-1">
              Enter the @handle of any verified user. They'll receive an in-app invitation.
            </p>
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground font-mono">@</span>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addInvitee();
                  }
                }}
                placeholder="handle"
                className="pl-7 font-mono"
              />
            </div>
            <Button type="button" onClick={addInvitee} disabled={searching} variant="secondary">
              {searching ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />}
              Add
            </Button>
          </div>
          {invitees.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {invitees.map((u) => (
                <span
                  key={u.id}
                  className="flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-md bg-secondary border border-border/60 text-sm"
                >
                  <span className="font-mono text-primary">@{u.handle}</span>
                  <span className="text-muted-foreground text-xs">{u.display_name}</span>
                  <button
                    type="button"
                    onClick={() => setInvitees((p) => p.filter((x) => x.id !== u.id))}
                    className="size-5 grid place-items-center rounded hover:bg-destructive/20"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : null}
            Start meeting
          </Button>
        </div>
      </form>
    </div>
  );
}
