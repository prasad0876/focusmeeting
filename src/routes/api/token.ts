import { createFileRoute } from "@tanstack/react-router";
import { AccessToken } from "livekit-server-sdk";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

// LiveKit token endpoint.
// Auth: caller must present their Supabase access token in `Authorization: Bearer <token>`.
// We resolve the user server-side and check they belong to the requested meeting via RLS.
export const Route = createFileRoute("/api/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json()) as { meetingId?: string };
          const meetingId = body?.meetingId;
          if (!meetingId) return json({ error: "meetingId required" }, 400);

          const authHeader = request.headers.get("authorization") ?? "";
          const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
          if (!jwt) return json({ error: "Unauthorized" }, 401);

          const supabaseUrl = process.env.SUPABASE_URL!;
          const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
          const supabase = createClient<Database>(supabaseUrl, supabaseKey, {
            global: { headers: { Authorization: `Bearer ${jwt}` } },
            auth: { persistSession: false, autoRefreshToken: false },
          });

          const { data: userData, error: userErr } = await supabase.auth.getUser(jwt);
          if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
          const user = userData.user;

          // Verify access to the meeting via RLS (returns null if not permitted).
          const { data: meeting } = await supabase
            .from("meetings")
            .select("id, host_id, status")
            .eq("id", meetingId)
            .maybeSingle();
          if (!meeting) return json({ error: "Meeting not found or access denied" }, 403);
          if (meeting.status === "ended") return json({ error: "Meeting has ended" }, 409);

          // Reject users who have been removed from this meeting by host/admin/moderator.
          const { data: participantRow } = await supabase
            .from("meeting_participants")
            .select("is_removed")
            .eq("meeting_id", meetingId)
            .eq("user_id", user.id)
            .maybeSingle();
          if (participantRow?.is_removed) {
            return json({ error: "You have been removed from this meeting" }, 403);
          }

          // Load display info for the identity metadata.
          const { data: profile } = await supabase
            .from("profiles")
            .select("handle, display_name")
            .eq("id", user.id)
            .maybeSingle();

          const isHost = meeting.host_id === user.id;

          const apiKey = process.env.LIVEKIT_API_KEY!;
          const apiSecret = process.env.LIVEKIT_API_SECRET!;
          const livekitUrl = process.env.LIVEKIT_URL!;
          if (!apiKey || !apiSecret || !livekitUrl) {
            return json({ error: "LiveKit not configured" }, 500);
          }

          const at = new AccessToken(apiKey, apiSecret, {
            identity: user.id,
            name: profile?.display_name ?? profile?.handle ?? user.email ?? "Participant",
            ttl: 60 * 60 * 6, // 6h
            metadata: JSON.stringify({
              handle: profile?.handle ?? null,
              displayName: profile?.display_name ?? null,
              isHost,
            }),
          });

          at.addGrant({
            room: meetingId,
            roomJoin: true,
            canPublish: true,
            canSubscribe: true,
            canPublishData: true,
            canUpdateOwnMetadata: true,
            roomAdmin: isHost,
          });

          const token = await at.toJwt();

          return json({
            token,
            url: livekitUrl,
            identity: user.id,
            isHost,
          });
        } catch (err) {
          console.error("token endpoint error", err);
          return json({ error: "Failed to mint token" }, 500);
        }
      },
    },
  },
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
