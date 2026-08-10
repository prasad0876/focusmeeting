import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  LiveKitRoom,
  VideoConference,
  RoomAudioRenderer,
  useConnectionState,
  formatChatMessageLinks,
} from "@livekit/components-react";
import { ConnectionState, RoomOptions, VideoPresets } from "livekit-client";
import "@livekit/components-styles";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { hostEndMeeting } from "@/lib/meeting.functions";
import { AbuseWatcher } from "@/components/AbuseWatcher";


export const Route = createFileRoute("/_authenticated/meeting/$id")({
  head: ({ params }) => ({ meta: [{ title: `Meeting · focus.meet` }] }),
  component: MeetingRoom,
});

type TokenResp = { token: string; url: string; identity: string; isHost: boolean };

function MeetingRoom() {
  const { user } = Route.useRouteContext();
  const { id: meetingId } = Route.useParams();
  const router = useRouter();
  const endMeetingFn = useServerFn(hostEndMeeting);
  const isHostRef = useRef(false);

  const [meeting, setMeeting] = useState<{ id: string; title: string; host_id: string; status: string } | null>(null);
  const [connInfo, setConnInfo] = useState<TokenResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Bootstrap: fetch meeting, upsert participant, request LiveKit token.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: m, error: mErr } = await supabase
        .from("meetings")
        .select("id, title, host_id, status")
        .eq("id", meetingId)
        .maybeSingle();
      if (mErr || !m) {
        toast.error("You don't have access to this meeting");
        router.navigate({ to: "/dashboard" });
        return;
      }
      if (cancelled) return;
      if (m.status === "ended") {
        toast.info("This meeting has ended");
        router.navigate({ to: "/dashboard" });
        return;
      }
      setMeeting(m);
      isHostRef.current = m.host_id === user.id;

      // Note: never send is_removed here — a removed participant must not be
      // able to reinstate themselves by re-joining. Only host/admin can clear it.
      await supabase
        .from("meeting_participants")
        .upsert(
          {
            meeting_id: meetingId,
            user_id: user.id,
            joined_at: new Date().toISOString(),
            left_at: null,
          },
          { onConflict: "meeting_id,user_id" },
        );


      const { data: sess } = await supabase.auth.getSession();
      const accessToken = sess.session?.access_token;
      if (!accessToken) {
        setError("Not authenticated");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ meetingId }),
        });
        const payload = await res.json();
        if (!res.ok) throw new Error(payload?.error ?? "Failed to get token");
        if (cancelled) return;
        setConnInfo(payload as TokenResp);
      } catch (e: any) {
        setError(e?.message ?? "Failed to connect to LiveKit");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    // Realtime: if the meeting ends, kick everyone out.
    const statusCh = supabase
      .channel(`meeting-status-${meetingId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "meetings", filter: `id=eq.${meetingId}` },
        (payload: any) => {
          if (payload.new?.status === "ended") {
            toast.info("The host ended this meeting");
            router.navigate({ to: "/dashboard" });
          }
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(statusCh);
      // Mark participant left on unmount
      supabase
        .from("meeting_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("meeting_id", meetingId)
        .eq("user_id", user.id)
        .then();
      // If the host is leaving, end the meeting for everyone.
      if (isHostRef.current) {
        endMeetingFn({ data: { meetingId } }).catch((e) =>
          console.error("hostEndMeeting failed", e),
        );
      }
    };
  }, [meetingId, user.id, router, endMeetingFn]);

  const roomOptions = useMemo<RoomOptions>(
    () => ({
      adaptiveStream: true,
      dynacast: true,
      publishDefaults: {
        videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360, VideoPresets.h720],
        red: true,
        dtx: true,
      },
      videoCaptureDefaults: {
        resolution: VideoPresets.h720.resolution,
      },
      // Auto reconnect is on by default in livekit-client; expose config for clarity.
      reconnectPolicy: {
        nextRetryDelayInMs: ({ retryCount }) =>
          retryCount > 10 ? null : Math.min(2000 * retryCount, 15000),
      },
    }),
    [],
  );

  if (loading) {
    return (
      <div className="min-h-[80vh] grid place-items-center text-muted-foreground">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />
          Connecting to meeting…
        </div>
      </div>
    );
  }

  if (error || !connInfo || !meeting) {
    return (
      <div className="min-h-[80vh] grid place-items-center">
        <div className="max-w-md text-center space-y-4 p-6 rounded-xl border border-border/60 bg-secondary/30">
          <ShieldCheck className="size-8 mx-auto text-destructive" />
          <h1 className="text-lg font-semibold">Cannot join meeting</h1>
          <p className="text-sm text-muted-foreground">{error ?? "Unknown error"}</p>
          <Button asChild variant="outline">
            <Link to="/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-background flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border/60 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-2 min-w-0">
          <div className="size-7 rounded-md bg-primary/15 grid place-items-center">
            <ShieldCheck className="size-4 text-primary" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{meeting.title}</p>
            <p className="text-xs text-muted-foreground truncate">
              Secured by LiveKit · Room {meeting.id.slice(0, 8)}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col" data-lk-theme="default">
        <LiveKitRoom
          token={connInfo.token}
          serverUrl={connInfo.url}
          connect
          audio
          video
          options={roomOptions}
          onDisconnected={() => router.navigate({ to: "/dashboard" })}
          onError={(e) => toast.error(friendlyError(e))}
          style={{ height: "100%", display: "flex", flexDirection: "column", flex: 1 }}
        >
          <div className="absolute top-2 right-4 z-50">
            <ConnectionBadge />
          </div>
          <VideoConference chatMessageFormatter={formatChatMessageLinks} />
          <RoomAudioRenderer />
          <AbuseWatcher meetingId={meeting.id} userId={user.id} />

        </LiveKitRoom>
      </div>
    </div>
  );
}

function ConnectionBadge() {
  const state = useConnectionState();
  const map: Record<ConnectionState, { label: string; cls: string }> = {
    [ConnectionState.Disconnected]: { label: "Disconnected", cls: "bg-destructive/20 text-destructive" },
    [ConnectionState.Connecting]: { label: "Connecting…", cls: "bg-warning/20 text-warning" },
    [ConnectionState.Connected]: { label: "Live", cls: "bg-success/20 text-success" },
    [ConnectionState.Reconnecting]: { label: "Reconnecting…", cls: "bg-warning/20 text-warning" },
    [ConnectionState.SignalReconnecting]: { label: "Reconnecting…", cls: "bg-warning/20 text-warning" },
  };
  const info = map[state] ?? { label: state, cls: "bg-muted" };
  return (
    <span className={`text-[11px] font-mono px-2 py-1 rounded ${info.cls}`}>
      {info.label}
    </span>
  );
}
