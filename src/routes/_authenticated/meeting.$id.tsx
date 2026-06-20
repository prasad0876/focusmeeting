import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { moderateAndSendMessage } from "@/lib/moderation.functions";
import { moderateVideoFrame } from "@/lib/video-moderation.functions";
import { transcribeMeetingChunk } from "@/lib/meeting-memory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Video, VideoOff, Mic, MicOff, PhoneOff, Send, ShieldAlert,
  Eye, EyeOff, Users, AlertTriangle, Sparkles, MonitorUp, MonitorOff,
  BookOpenText, Captions, Presentation,
} from "lucide-react";
import { toast } from "sonner";
import { Whiteboard } from "@/components/Whiteboard";
import { useWebRTC } from "@/hooks/use-webrtc";

export const Route = createFileRoute("/_authenticated/meeting/$id")({
  head: ({ params }) => ({ meta: [{ title: `Meeting · Sentinel.meet` }] }),
  component: MeetingRoom,
});

type Participant = {
  id: string;
  meeting_id: string;
  user_id: string;
  is_muted: boolean;
  is_removed: boolean;
  focus_score: number;
  joined_at: string;
  left_at?: string | null;
  profile?: { handle: string; display_name: string };
};

type Message = {
  id: string;
  user_id: string;
  content: string;
  is_flagged: boolean;
  severity: string | null;
  created_at: string;
};

type Incident = {
  id: string;
  user_id: string;
  severity: string;
  category: string;
  excerpt: string | null;
  action_taken: string;
  created_at: string;
};

function MeetingRoom() {
  const { user } = Route.useRouteContext();
  const { id: meetingId } = Route.useParams();
  const router = useRouter();
  const moderateFn = useServerFn(moderateAndSendMessage);
  const moderateFrameFn = useServerFn(moderateVideoFrame);

  const [meeting, setMeeting] = useState<{ id: string; title: string; host_id: string; status: string } | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [micOn, setMicOn] = useState(true);
  const [focusScore, setFocusScore] = useState(95);
  const [hostAlert, setHostAlert] = useState<string | null>(null);
  const [sharingScreen, setSharingScreen] = useState(false);
  const [liveCaption, setLiveCaption] = useState<{ speaker: string; text: string } | null>(null);
  const [captionsOn, setCaptionsOn] = useState(true);
  const [whiteboardOpen, setWhiteboardOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const meetingStartRef = useRef<number>(Date.now());

  const { remotePeers, replaceLocalStream } = useWebRTC({
    meetingId,
    userId: user.id,
    localStream,
  });

  const isHost = meeting?.host_id === user.id;

  // Load meeting + join + subscribe
  useEffect(() => {
    let unmounted = false;
    (async () => {
      const { data: m, error } = await supabase
        .from("meetings")
        .select("id, title, host_id, status")
        .eq("id", meetingId)
        .maybeSingle();
      if (error || !m) {
        toast.error("You don't have access to this meeting");
        router.navigate({ to: "/dashboard" });
        return;
      }
      if (unmounted) return;
      setMeeting(m);

      // Upsert participant
      await supabase
        .from("meeting_participants")
        .upsert(
          { meeting_id: meetingId, user_id: user.id, joined_at: new Date().toISOString(), left_at: null, is_removed: false },
          { onConflict: "meeting_id,user_id" },
        );

      await reloadAll();
    })();

    const channel = supabase
      .channel(`meeting:${meetingId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meeting_participants", filter: `meeting_id=eq.${meetingId}` }, reloadParticipants)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "meeting_messages", filter: `meeting_id=eq.${meetingId}` }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Message]);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "abuse_incidents", filter: `meeting_id=eq.${meetingId}` }, (payload) => {
        const inc = payload.new as Incident;
        setIncidents((prev) => [inc, ...prev]);
        if (inc.user_id === user.id) {
          if (inc.severity === "low") toast.warning("Heads up: that message was flagged as mildly rude.");
          if (inc.severity === "moderate") toast.error("You've been temporarily muted for inappropriate language.");
          if (inc.severity === "high") toast.error("Severe violation — the host has been notified.");
          if (inc.severity === "severe") {
            toast.error("Removed for severe abuse.");
            leaveAndExit();
          }
        }
      })
      .subscribe();

    return () => {
      unmounted = true;
      supabase.removeChannel(channel);
      stopCamera();
      screenStreamRef.current?.getTracks().forEach((t) => t.stop());
      // leave silently
      supabase
        .from("meeting_participants")
        .update({ left_at: new Date().toISOString() })
        .eq("meeting_id", meetingId)
        .eq("user_id", user.id)
        .then();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, user.id]);

  const reloadParticipants = async () => {
    const { data } = await supabase
      .from("meeting_participants")
      .select("id, meeting_id, user_id, is_muted, is_removed, focus_score, joined_at, profile:profiles(handle, display_name)")
      .eq("meeting_id", meetingId);
    setParticipants((data as any) ?? []);
  };

  const reloadAll = async () => {
    await reloadParticipants();
    const [{ data: msgs }, { data: incs }] = await Promise.all([
      supabase.from("meeting_messages").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: true }).limit(200),
      supabase.from("abuse_incidents").select("*").eq("meeting_id", meetingId).order("created_at", { ascending: false }).limit(50),
    ]);
    setMessages((msgs as Message[]) ?? []);
    setIncidents((incs as Incident[]) ?? []);
  };

  // Camera + mic capture. We always try to get both so toggles flip track.enabled
  // without losing the peer connection.
  useEffect(() => {
    if (!camOn && !micOn) {
      stopCamera();
      return;
    }
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: camOn,
          audio: micOn,
        });
        cameraStreamRef.current = stream;
        streamRef.current = stream;
        if (!sharingScreen) {
          setLocalStream(stream);
          await replaceLocalStream(stream);
          if (videoRef.current) videoRef.current.srcObject = stream;
        }
      } catch {
        toast.error("Camera/mic access denied");
        setCamOn(false);
      }
    })();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn]);


  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => (t.enabled = micOn));
  }, [micOn]);

  const stopCamera = () => {
    cameraStreamRef.current?.getTracks().forEach((t) => t.stop());
    cameraStreamRef.current = null;
    streamRef.current = null;
    if (videoRef.current && !sharingScreen) videoRef.current.srcObject = null;
  };

  const stopScreenShare = async () => {
    screenStreamRef.current?.getTracks().forEach((t) => t.stop());
    screenStreamRef.current = null;
    setSharingScreen(false);
    // Restore camera+mic outbound stream
    const cam = cameraStreamRef.current;
    setLocalStream(cam);
    await replaceLocalStream(cam);
    if (videoRef.current) {
      videoRef.current.srcObject = camOn && cam ? cam : null;
    }
  };

  const startScreenShare = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: true, // Capture tab/system audio when the browser allows it
      });
      screenStreamRef.current = stream;
      setSharingScreen(true);

      // Combine screen video + (screen audio OR mic audio) into one outbound stream
      const out = new MediaStream();
      stream.getVideoTracks().forEach((t) => out.addTrack(t));
      const screenAudio = stream.getAudioTracks();
      if (screenAudio.length > 0) {
        screenAudio.forEach((t) => out.addTrack(t));
      } else if (cameraStreamRef.current && micOn) {
        cameraStreamRef.current.getAudioTracks().forEach((t) => out.addTrack(t));
      }
      setLocalStream(out);
      await replaceLocalStream(out);

      if (videoRef.current) videoRef.current.srcObject = stream;
      stream.getVideoTracks()[0].addEventListener("ended", stopScreenShare);
      toast.success(screenAudio.length > 0 ? "Screen + audio sharing started" : "Screen sharing started (no audio shared)");
    } catch (err: any) {
      if (err?.name !== "NotAllowedError") {
        toast.error("Could not start screen share");
      }
    }
  };


  // Focus detection (privacy-first: local heuristic based on tab visibility + small drift)
  useEffect(() => {
    let drift = 0;
    const tick = async () => {
      const visible = document.visibilityState === "visible";
      const focused = document.hasFocus();
      drift += (Math.random() - 0.5) * 6;
      drift = Math.max(-20, Math.min(20, drift));
      const base = visible && focused && camOn ? 90 : visible ? 60 : 25;
      const score = Math.max(0, Math.min(100, Math.round(base + drift)));
      setFocusScore(score);
      await supabase.from("focus_samples").insert({ meeting_id: meetingId, user_id: user.id, focus_score: score });
      await supabase
        .from("meeting_participants")
        .update({ focus_score: score })
        .eq("meeting_id", meetingId)
        .eq("user_id", user.id);
    };
    const i = setInterval(tick, 7000);
    tick();
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meetingId, user.id, camOn]);

  // Privacy-protected local camera moderation.
  // Periodically capture a small downscaled frame in-browser, send it to the
  // AI gateway via a server function for visual-abuse classification, and
  // discard immediately. The frame is NEVER stored — only a text reasoning
  // excerpt is persisted on flagged incidents.
  useEffect(() => {
    if (!camOn) return;
    let cancelled = false;

    const captureAndModerate = async () => {
      const video = videoRef.current;
      const stream = streamRef.current;
      if (!video || !stream || video.readyState < 2 || video.videoWidth === 0) return;
      const myParticipant = participants.find((p) => p.user_id === user.id);
      if (myParticipant?.is_removed) return;

      try {
        const targetW = 320;
        const scale = targetW / video.videoWidth;
        const w = targetW;
        const h = Math.round(video.videoHeight * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(video, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.55);
        if (cancelled) return;
        await moderateFrameFn({ data: { meetingId, imageDataUrl: dataUrl } });
      } catch (err) {
        // Silent — visual moderation must never break the call.
        console.warn("[visual-moderation]", err);
      }
    };

    // Stagger first run a bit so the stream is ready.
    const initial = setTimeout(captureAndModerate, 4000);
    const interval = setInterval(captureAndModerate, 20_000);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, meetingId, user.id]);

  // ===== AI Meeting Memory: continuous audio transcription =====
  const transcribeFn = useServerFn(transcribeMeetingChunk);
  useEffect(() => {
    if (!micOn) return;
    let cancelled = false;
    let recorder: MediaRecorder | null = null;
    let audioStream: MediaStream | null = null;
    let chunkStartMs = 0;

    const mime =
      typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/mp4")
        ? "audio/mp4"
        : "audio/webm";

    const cycle = async () => {
      try {
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          audioStream.getTracks().forEach((t) => t.stop());
          return;
        }
        const startLoop = () => {
          if (cancelled || !audioStream) return;
          const chunks: Blob[] = [];
          chunkStartMs = Date.now() - meetingStartRef.current;
          recorder = new MediaRecorder(audioStream, { mimeType: mime });
          recorder.ondataavailable = (e) => {
            if (e.data && e.data.size > 0) chunks.push(e.data);
          };
          recorder.onstop = async () => {
            const blob = new Blob(chunks, { type: mime });
            const endMs = Date.now() - meetingStartRef.current;
            if (blob.size > 2000 && !cancelled) {
              try {
                const buf = await blob.arrayBuffer();
                let bin = "";
                const u8 = new Uint8Array(buf);
                const step = 0x8000;
                for (let i = 0; i < u8.length; i += step) {
                  bin += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + step)) as number[]);
                }
                const b64 = btoa(bin);
                const res = await transcribeFn({
                  data: {
                    meetingId,
                    audioBase64: b64,
                    mimeType: mime,
                    startedAtMs: Math.max(0, chunkStartMs),
                    endedAtMs: Math.max(0, endMs),
                  },
                });
                if (res?.text && captionsOn) {
                  const cap = { speaker: "You", text: res.text };
                  setLiveCaption(cap);
                  setTimeout(() => setLiveCaption((c) => (c?.text === cap.text ? null : c)), 6000);
                }
              } catch (err) {
                console.warn("[stt] chunk", err);
              }
            }
            if (!cancelled) startLoop();
          };
          recorder.start();
          setTimeout(() => {
            try { if (recorder?.state === "recording") recorder.stop(); } catch {}
          }, 12_000);
        };
        startLoop();
      } catch (err) {
        console.warn("[stt] mic", err);
      }
    };
    cycle();

    return () => {
      cancelled = true;
      try { if (recorder?.state === "recording") recorder.stop(); } catch {}
      audioStream?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micOn, meetingId]);

  // Live captions from other participants
  useEffect(() => {
    const ch = supabase
      .channel(`captions:${meetingId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "meeting_transcripts", filter: `meeting_id=eq.${meetingId}` },
        (payload) => {
          const row = payload.new as { user_id: string; speaker_name: string; content: string };
          if (row.user_id === user.id) return;
          if (!captionsOn) return;
          const cap = { speaker: row.speaker_name ?? "Speaker", text: row.content };
          setLiveCaption(cap);
          setTimeout(() => setLiveCaption((c) => (c?.text === cap.text ? null : c)), 6000);
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [meetingId, user.id, captionsOn]);



  // Host aggregate alert
  useEffect(() => {
    if (!isHost) return;
    const active = participants.filter((p) => !p.is_removed && !p.left_at);
    if (active.length < 2) {
      setHostAlert(null);
      return;
    }
    const distracted = active.filter((p) => p.focus_score < 50).length;
    if (distracted / active.length > 0.5) {
      setHostAlert(`${distracted} of ${active.length} participants appear distracted. Try an interactive question, a short break, or a poll.`);
    } else {
      setHostAlert(null);
    }
  }, [participants, isHost]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = draft.trim();
    if (!content) return;
    const myParticipant = participants.find((p) => p.user_id === user.id);
    if (myParticipant?.is_muted) {
      toast.error("You're temporarily muted.");
      return;
    }
    setSending(true);
    try {
      await moderateFn({ data: { meetingId, content } });
      setDraft("");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not send");
    } finally {
      setSending(false);
    }
  };

  const leaveAndExit = async () => {
    stopCamera();
    await supabase
      .from("meeting_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("meeting_id", meetingId)
      .eq("user_id", user.id);
    router.navigate({ to: "/dashboard" });
  };

  const endMeeting = async () => {
    await supabase.from("meetings").update({ status: "ended", ended_at: new Date().toISOString() }).eq("id", meetingId);
    leaveAndExit();
  };

  const active = useMemo(() => participants.filter((p) => !p.is_removed), [participants]);
  const avgFocus = active.length ? Math.round(active.reduce((s, p) => s + p.focus_score, 0) / active.length) : 0;
  const myMuted = active.find((p) => p.user_id === user.id)?.is_muted;

  return (
    <div className="h-[calc(100vh-4rem)] grid lg:grid-cols-[1fr_360px]">
      {/* Stage */}
      <div className="flex flex-col bg-background border-r border-border/60 min-h-0">
        <div className="px-6 py-4 border-b border-border/60 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-semibold tracking-tight">{meeting?.title ?? "Meeting"}</h1>
            <p className="text-xs font-mono text-muted-foreground mt-0.5 flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-success pulse-ring" />
              LIVE · {active.length} participant{active.length === 1 ? "" : "s"}
              {isHost && <span className="text-primary">· you are host</span>}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <FocusGauge label="You" value={focusScore} />
            <FocusGauge label="Room" value={avgFocus} />
            <Button asChild size="sm" variant="secondary">
              <Link to="/memory/$id" params={{ id: meetingId }}>
                <BookOpenText className="size-4" /> Memory
              </Link>
            </Button>
          </div>
        </div>

        {hostAlert && (
          <div className="m-4 p-4 rounded-lg border border-warning/40 bg-warning/10 flex items-start gap-3">
            <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-warning">Attention alert</p>
              <p className="text-foreground/90 mt-0.5">{hostAlert}</p>
            </div>
          </div>
        )}

        <div className="flex-1 p-6 grid grid-cols-2 md:grid-cols-3 auto-rows-fr gap-3 overflow-auto relative">
          {/* Self tile */}
          <ParticipantTile
            self
            handle="you"
            displayName="You"
            focus={focusScore}
            muted={!!myMuted}
            isLocalCamera={camOn}
            videoRef={videoRef}
          />
          {active
            .filter((p) => p.user_id !== user.id)
            .map((p) => (
              <ParticipantTile
                key={p.id}
                handle={p.profile?.handle ?? "user"}
                displayName={p.profile?.display_name ?? "User"}
                focus={p.focus_score}
                muted={p.is_muted}
                remoteStream={remotePeers[p.user_id]}
              />
            ))}

          {/* Live caption overlay */}
          {captionsOn && liveCaption && (
            <div className="pointer-events-none sticky bottom-2 left-0 right-0 col-span-full flex justify-center">
              <div className="max-w-2xl mx-auto px-4 py-2 rounded-lg bg-background/85 backdrop-blur border border-border/60 text-sm shadow-lg">
                <span className="text-[10px] font-mono uppercase text-primary mr-2">{liveCaption.speaker}</span>
                {liveCaption.text}
              </div>
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="border-t border-border/60 px-6 py-4 flex items-center justify-center gap-2 flex-wrap">
          <ControlBtn active={micOn} onClick={() => setMicOn((v) => !v)} on={<Mic className="size-4" />} off={<MicOff className="size-4" />} />
          <ControlBtn active={camOn} onClick={() => setCamOn((v) => !v)} on={<Video className="size-4" />} off={<VideoOff className="size-4" />} />
          <ControlBtn
            active={captionsOn}
            onClick={() => setCaptionsOn((v) => !v)}
            on={<Captions className="size-4" />}
            off={<Captions className="size-4 opacity-50" />}
          />
          <ControlBtn
            active={sharingScreen}
            onClick={sharingScreen ? stopScreenShare : startScreenShare}
            on={<MonitorUp className="size-4" />}
            off={<MonitorOff className="size-4" />}
          />
          <ControlBtn
            active={whiteboardOpen}
            onClick={() => setWhiteboardOpen((v) => !v)}
            on={<Presentation className="size-4" />}
            off={<Presentation className="size-4 opacity-50" />}
          />
          <Button variant="destructive" onClick={isHost ? endMeeting : leaveAndExit}>
            <PhoneOff className="size-4" /> {isHost ? "End meeting" : "Leave"}
          </Button>
        </div>
      </div>


      {/* Side panel */}
      <aside className="flex flex-col bg-surface min-h-0">
        <div className="border-b border-border/60 px-4 py-3 flex items-center gap-2">
          <Sparkles className="size-4 text-primary" />
          <p className="text-sm font-medium">AI chat moderation</p>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            {incidents.length} flagged
          </span>
        </div>

        <ScrollArea className="flex-1 px-4 py-3">
          <div className="space-y-3">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                Every message is scanned by AI for abuse, harassment and threats before it lands.
              </p>
            ) : (
              messages.map((m) => {
                const participant = participants.find((p) => p.user_id === m.user_id);
                const me = m.user_id === user.id;
                return (
                  <div key={m.id} className={`space-y-0.5 ${me ? "text-right" : ""}`}>
                    <p className="text-[10px] font-mono text-muted-foreground">
                      @{participant?.profile?.handle ?? "user"} · {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </p>
                    <div
                      className={`inline-block max-w-[85%] px-3 py-2 rounded-lg text-sm border ${
                        m.is_flagged
                          ? "border-destructive/40 bg-destructive/10 text-destructive-foreground"
                          : me
                          ? "border-primary/40 bg-primary/10"
                          : "border-border/60 bg-secondary/40"
                      }`}
                    >
                      {m.is_flagged && (
                        <span className="block text-[10px] font-mono uppercase text-destructive mb-1 flex items-center gap-1">
                          <ShieldAlert className="size-3" /> Flagged · {m.severity}
                        </span>
                      )}
                      {m.content}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>

        <form onSubmit={sendMessage} className="border-t border-border/60 p-3 flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={myMuted ? "You are muted" : "Say something…"}
            disabled={sending || !!myMuted}
          />
          <Button type="submit" size="sm" disabled={sending || !draft.trim() || !!myMuted}>
            <Send className="size-4" />
          </Button>
        </form>

        {isHost && incidents.length > 0 && (
          <div className="border-t border-border/60 max-h-48">
            <p className="px-4 py-2 text-xs font-mono uppercase text-muted-foreground flex items-center gap-1.5">
              <Users className="size-3" /> Incident log
            </p>
            <ScrollArea className="h-36 px-4 pb-3">
              <ul className="space-y-1.5">
                {incidents.map((i) => {
                  const p = participants.find((pp) => pp.user_id === i.user_id);
                  return (
                    <li key={i.id} className="text-xs flex items-start gap-2">
                      <span className={`mt-0.5 size-1.5 rounded-full ${i.severity === "severe" ? "bg-destructive" : i.severity === "high" ? "bg-destructive/70" : "bg-warning"}`} />
                      <span className="flex-1">
                        <span className="font-mono text-foreground">@{p?.profile?.handle ?? "user"}</span>{" "}
                        <span className="text-muted-foreground">{i.action_taken.replace("_", " ")}</span>
                      </span>
                      <span className="text-[10px] font-mono text-muted-foreground">{i.severity}</span>
                    </li>
                  );
                })}
              </ul>
            </ScrollArea>
          </div>
        )}
      </aside>

      {whiteboardOpen && (
        <Whiteboard meetingId={meetingId} userId={user.id} onClose={() => setWhiteboardOpen(false)} />
      )}
    </div>
  );
}

function ControlBtn({ active, onClick, on, off }: { active: boolean; onClick: () => void; on: React.ReactNode; off: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`size-10 grid place-items-center rounded-full border transition ${
        active ? "bg-secondary border-border/60 hover:bg-secondary/80" : "bg-destructive/20 border-destructive/40 text-destructive"
      }`}
    >
      {active ? on : off}
    </button>
  );
}

function FocusGauge({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? "text-success" : value >= 40 ? "text-warning" : "text-destructive";
  return (
    <div className="text-right">
      <p className="text-[10px] font-mono uppercase text-muted-foreground tracking-wider">{label} focus</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}%</p>
    </div>
  );
}

function ParticipantTile({
  handle,
  displayName,
  focus,
  muted,
  self,
  isLocalCamera,
  videoRef,
}: {
  handle: string;
  displayName: string;
  focus: number;
  muted: boolean;
  self?: boolean;
  isLocalCamera?: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
}) {
  const focused = focus >= 50;
  return (
    <div className="relative rounded-xl bg-secondary/40 border border-border/60 overflow-hidden aspect-video group">
      {self && isLocalCamera ? (
        <video ref={videoRef} autoPlay muted playsInline className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 grid place-items-center">
          <div className="size-16 rounded-full bg-primary/15 grid place-items-center border border-primary/30">
            <span className="text-xl font-semibold text-primary">{displayName.slice(0, 1).toUpperCase()}</span>
          </div>
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-transparent to-transparent" />
      <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-mono truncate text-foreground/90">@{handle}</p>
          <p className="text-[10px] text-muted-foreground truncate">{displayName}</p>
        </div>
        <div className="flex items-center gap-1">
          {muted && <span className="size-6 grid place-items-center rounded bg-destructive/30 text-destructive"><MicOff className="size-3" /></span>}
          <span className={`size-6 grid place-items-center rounded ${focused ? "bg-success/20 text-success" : "bg-warning/20 text-warning"}`}>
            {focused ? <Eye className="size-3" /> : <EyeOff className="size-3" />}
          </span>
        </div>
      </div>
      <div className="absolute top-2 right-2 text-[10px] font-mono px-1.5 py-0.5 rounded bg-background/70 backdrop-blur">
        {focus}%
      </div>
    </div>
  );
}
