import { useEffect, useRef } from "react";
import { useChat, useLocalParticipant, useRoomContext } from "@livekit/components-react";
import { Track } from "livekit-client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { moderateAndSendMessage } from "@/lib/moderation.functions";
import { transcribeMeetingChunk } from "@/lib/meeting-memory.functions";
import { supabase } from "@/integrations/supabase/client";

type Severity = "none" | "low" | "moderate" | "high" | "severe";

function warn(severity: Severity, source: "chat" | "mic") {
  const where = source === "chat" ? "message" : "speech";
  switch (severity) {
    case "low":
      toast.warning(`Watch your language — your ${where} was flagged as inappropriate.`);
      break;
    case "moderate":
      toast.error(`Your ${where} was flagged as abusive. You have been muted.`);
      break;
    case "high":
      toast.error(`Your ${where} was flagged as harassment. The host has been notified.`);
      break;
    case "severe":
      toast.error(`Severe abuse detected in your ${where}. You are being removed from the meeting.`);
      break;
    default:
      break;
  }
}

/**
 * Runs inside <LiveKitRoom>. Scans this participant's chat messages and their
 * microphone audio (in ~12s chunks) for abusive content, and enforces the
 * mute / removal decisions coming back from the server.
 */
export function AbuseWatcher({ meetingId, userId }: { meetingId: string; userId: string }) {
  const room = useRoomContext();
  const { chatMessages } = useChat();
  const { localParticipant } = useLocalParticipant();
  const moderateChat = useServerFn(moderateAndSendMessage);
  const transcribe = useServerFn(transcribeMeetingChunk);
  const scanned = useRef<Set<string>>(new Set());

  /* ---------- Chat moderation ---------- */
  useEffect(() => {
    const mine = chatMessages.filter((m) => !m.from || m.from.isLocal);
    for (const m of mine) {
      const key = `${m.timestamp}-${m.message}`;
      if (scanned.current.has(key)) continue;
      scanned.current.add(key);
      const content = (m.message ?? "").trim();
      if (!content) continue;
      moderateChat({ data: { meetingId, content } })
        .then((res: any) => warn(res?.severity as Severity, "chat"))
        .catch((e) => console.error("[abuse] chat scan failed", e));
    }
  }, [chatMessages, meetingId, moderateChat]);

  /* ---------- Microphone (spoken abuse) moderation ---------- */
  useEffect(() => {
    let recorder: MediaRecorder | null = null;
    let stopped = false;
    let sliceStart = 0;
    const startedAt = Date.now();

    const start = () => {
      if (stopped || recorder) return;
      const pub = localParticipant.getTrackPublication(Track.Source.Microphone);
      const mst = pub?.track?.mediaStreamTrack;
      if (!mst) return;

      let mime = "audio/webm;codecs=opus";
      if (typeof MediaRecorder === "undefined") return;
      if (!MediaRecorder.isTypeSupported(mime)) mime = "audio/webm";
      if (!MediaRecorder.isTypeSupported(mime)) mime = "audio/mp4";
      if (!MediaRecorder.isTypeSupported(mime)) return;

      try {
        recorder = new MediaRecorder(new MediaStream([mst.clone()]), { mimeType: mime });
      } catch (e) {
        console.error("[abuse] recorder init", e);
        return;
      }

      recorder.ondataavailable = async (ev) => {
        if (!ev.data || ev.data.size < 4000) return; // ignore near-silent slivers
        const from = sliceStart;
        sliceStart = Date.now() - startedAt;
        try {
          const buf = new Uint8Array(await ev.data.arrayBuffer());
          let bin = "";
          for (let i = 0; i < buf.length; i += 8192) {
            bin += String.fromCharCode(...buf.subarray(i, i + 8192));
          }
          const res: any = await transcribe({
            data: {
              meetingId,
              audioBase64: btoa(bin),
              mimeType: mime,
              startedAtMs: from,
              endedAtMs: sliceStart,
            },
          });
          if (res?.severity && res.severity !== "none") warn(res.severity as Severity, "mic");
        } catch (e) {
          console.error("[abuse] speech scan failed", e);
        }
      };
      recorder.start(12000);
    };

    start();
    const poll = window.setInterval(start, 3000);

    return () => {
      stopped = true;
      window.clearInterval(poll);
      try {
        recorder?.stop();
      } catch {
        /* ignore */
      }
      recorder = null;
    };
  }, [localParticipant, meetingId, transcribe]);

  /* ---------- Enforcement: react to mute / removal decisions ---------- */
  useEffect(() => {
    const ch = supabase
      .channel(`enforce-${meetingId}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "meeting_participants",
          filter: `meeting_id=eq.${meetingId}`,
        },
        (payload: any) => {
          const row = payload.new;
          if (!row || row.user_id !== userId) return;
          if (row.is_removed) {
            toast.error("You have been removed from this meeting.");
            room.disconnect().catch(() => undefined);
            return;
          }
          if (row.is_muted && localParticipant.isMicrophoneEnabled) {
            localParticipant.setMicrophoneEnabled(false).catch(() => undefined);
            toast.error("Your microphone was muted by moderation.");
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(ch);
    };
  }, [meetingId, userId, room, localParticipant]);

  return null;
}
