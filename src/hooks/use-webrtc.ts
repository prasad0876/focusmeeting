import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RealtimeChannel } from "@supabase/supabase-js";

/**
 * WebRTC mesh with Supabase Realtime signaling.
 *
 * - Presence on `rtc:${meetingId}` tracks who is in the room (keyed by userId).
 * - When a new peer appears, both sides create an RTCPeerConnection.
 *   The peer with the lexicographically smaller userId acts as the "polite"
 *   offerer to avoid glare.
 * - SDP and ICE are exchanged via channel.send (broadcast) targeted at a peer.
 * - Local stream tracks are added; replacing tracks (e.g. screen share) is
 *   handled via `replaceLocalStream`.
 */
export type RemotePeer = {
  userId: string;
  stream: MediaStream;
};

type SignalPayload =
  | { kind: "offer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "answer"; from: string; to: string; sdp: RTCSessionDescriptionInit }
  | { kind: "ice"; from: string; to: string; candidate: RTCIceCandidateInit }
  | { kind: "hello"; from: string; to: string };

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:global.stun.twilio.com:3478" },
  ],
};

export function useWebRTC(opts: {
  meetingId: string;
  userId: string;
  localStream: MediaStream | null;
}) {
  const { meetingId, userId, localStream } = opts;
  const [remotePeers, setRemotePeers] = useState<Record<string, MediaStream>>({});
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const sendersRef = useRef<Map<string, RTCRtpSender[]>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());

  // Keep latest stream in ref so async handlers see updates
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  const send = useCallback((payload: SignalPayload) => {
    const ch = channelRef.current;
    if (!ch) return;
    ch.send({ type: "broadcast", event: "signal", payload });
  }, []);

  const ensurePeer = useCallback(
    (peerId: string): RTCPeerConnection => {
      let pc = pcsRef.current.get(peerId);
      if (pc) return pc;

      pc = new RTCPeerConnection(RTC_CONFIG);
      pcsRef.current.set(peerId, pc);

      // Attach current local tracks
      const senders: RTCRtpSender[] = [];
      const stream = localStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((track) => {
          senders.push(pc!.addTrack(track, stream));
        });
      }
      sendersRef.current.set(peerId, senders);

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          send({ kind: "ice", from: userId, to: peerId, candidate: ev.candidate.toJSON() });
        }
      };

      const remoteStream = new MediaStream();
      pc.ontrack = (ev) => {
        ev.streams[0]?.getTracks().forEach((t) => remoteStream.addTrack(t));
        if (!ev.streams[0]) remoteStream.addTrack(ev.track);
        setRemotePeers((prev) => ({ ...prev, [peerId]: remoteStream }));
      };

      pc.onconnectionstatechange = () => {
        if (pc!.connectionState === "failed" || pc!.connectionState === "closed") {
          closePeer(peerId);
        }
      };

      return pc;
    },
    [send, userId],
  );

  const closePeer = useCallback((peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    pc?.close();
    pcsRef.current.delete(peerId);
    sendersRef.current.delete(peerId);
    pendingIceRef.current.delete(peerId);
    setRemotePeers((prev) => {
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const startOffer = useCallback(
    async (peerId: string) => {
      const pc = ensurePeer(peerId);
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        send({ kind: "offer", from: userId, to: peerId, sdp: offer });
      } catch (err) {
        console.warn("[rtc] offer", err);
      }
    },
    [ensurePeer, send, userId],
  );

  // Flush queued ICE once remote description is set
  const flushIce = useCallback(async (peerId: string) => {
    const pc = pcsRef.current.get(peerId);
    const queue = pendingIceRef.current.get(peerId) ?? [];
    if (!pc || !pc.remoteDescription) return;
    for (const c of queue) {
      try {
        await pc.addIceCandidate(c);
      } catch (e) {
        console.warn("[rtc] flush ice", e);
      }
    }
    pendingIceRef.current.set(peerId, []);
  }, []);

  // Main signaling channel — established once per meeting+user
  useEffect(() => {
    if (!meetingId || !userId) return;
    const channel = supabase.channel(`rtc:${meetingId}`, {
      config: { presence: { key: userId }, broadcast: { self: false } },
    });
    channelRef.current = channel;

    channel.on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      const peerIds = Object.keys(state).filter((k) => k !== userId);
      // Open connection with every present peer
      for (const peerId of peerIds) {
        if (!pcsRef.current.has(peerId)) {
          // Smaller userId is the offerer
          if (userId < peerId) {
            ensurePeer(peerId);
            startOffer(peerId);
          } else {
            // Say hello so the offerer knows we are ready
            send({ kind: "hello", from: userId, to: peerId });
          }
        }
      }
      // Close pcs for peers who left
      for (const existing of Array.from(pcsRef.current.keys())) {
        if (!peerIds.includes(existing)) closePeer(existing);
      }
    });

    channel.on("broadcast", { event: "signal" }, async ({ payload }) => {
      const msg = payload as SignalPayload;
      if (msg.to !== userId) return;
      const peerId = msg.from;
      const pc = ensurePeer(peerId);
      try {
        if (msg.kind === "hello") {
          if (userId < peerId) startOffer(peerId);
        } else if (msg.kind === "offer") {
          await pc.setRemoteDescription(msg.sdp);
          await flushIce(peerId);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          send({ kind: "answer", from: userId, to: peerId, sdp: answer });
        } else if (msg.kind === "answer") {
          if (pc.signalingState === "have-local-offer") {
            await pc.setRemoteDescription(msg.sdp);
            await flushIce(peerId);
          }
        } else if (msg.kind === "ice") {
          if (pc.remoteDescription) {
            await pc.addIceCandidate(msg.candidate);
          } else {
            const q = pendingIceRef.current.get(peerId) ?? [];
            q.push(msg.candidate);
            pendingIceRef.current.set(peerId, q);
          }
        }
      } catch (err) {
        console.warn("[rtc] signal handler", err);
      }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await channel.track({ userId, joinedAt: Date.now() });
      }
    });

    return () => {
      pcsRef.current.forEach((pc) => pc.close());
      pcsRef.current.clear();
      sendersRef.current.clear();
      pendingIceRef.current.clear();
      setRemotePeers({});
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [meetingId, userId, ensurePeer, startOffer, send, flushIce, closePeer]);

  /**
   * Swap the outbound media stream (e.g., switch to screen share or back to camera).
   * Uses RTCRtpSender.replaceTrack so renegotiation isn't required for same-kind swaps.
   * Adds new senders if a kind is missing.
   */
  const replaceLocalStream = useCallback(async (next: MediaStream | null) => {
    localStreamRef.current = next;
    for (const [peerId, pc] of pcsRef.current.entries()) {
      const senders = pc.getSenders();
      const kinds: Array<"video" | "audio"> = ["video", "audio"];
      for (const kind of kinds) {
        const newTrack = next?.getTracks().find((t) => t.kind === kind) ?? null;
        const sender = senders.find((s) => s.track?.kind === kind);
        if (sender) {
          try {
            await sender.replaceTrack(newTrack);
          } catch (e) {
            console.warn("[rtc] replaceTrack", e);
          }
        } else if (newTrack && next) {
          try {
            pc.addTrack(newTrack, next);
            // Need renegotiation when adding a new sender
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            send({ kind: "offer", from: userId, to: peerId, sdp: offer });
          } catch (e) {
            console.warn("[rtc] addTrack", e);
          }
        }
      }
    }
  }, [send, userId]);

  return { remotePeers, replaceLocalStream };
}
