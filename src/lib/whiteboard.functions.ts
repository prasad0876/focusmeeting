import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type DiagramElement =
  | { kind: "note"; x: number; y: number; w: number; h: number; text: string; color: string }
  | { kind: "rect"; x: number; y: number; w: number; h: number; text: string; color: string }
  | { kind: "ellipse"; x: number; y: number; w: number; h: number; text: string; color: string }
  | { kind: "arrow"; x1: number; y1: number; x2: number; y2: number; color: string }
  | { kind: "text"; x: number; y: number; text: string; color: string };

const PALETTE = ["#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4", "#a855f7"];

export const generateWhiteboardDiagram = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { meetingId: string; prompt: string; mode?: "flow" | "mindmap" | "notes" }) => {
    if (!input?.meetingId) throw new Error("meetingId required");
    if (!input?.prompt || input.prompt.trim().length < 3) throw new Error("prompt required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { meetingId, prompt, mode = "flow" } = data;

    const { data: allowed } = await supabase.rpc("can_access_meeting", {
      _meeting: meetingId,
      _user: userId,
    });
    if (!allowed) throw new Error("Not allowed for this meeting");

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("AI gateway not configured");

    const systemPrompt = `You convert short text prompts into a structured whiteboard diagram.
Return STRICT JSON only, no commentary. The diagram is a JSON object:
{ "title": string, "elements": Array<Element> }

Element shapes (coordinates in a 1200x700 logical canvas, origin top-left):
  { "kind": "rect",    "x": number, "y": number, "w": number, "h": number, "text": string }
  { "kind": "ellipse", "x": number, "y": number, "w": number, "h": number, "text": string }
  { "kind": "note",    "x": number, "y": number, "w": number, "h": number, "text": string }
  { "kind": "arrow",   "x1": number, "y1": number, "x2": number, "y2": number }
  { "kind": "text",    "x": number, "y": number, "text": string }

Rules:
- Use 4-12 nodes for a "${mode}" diagram.
- Space nodes generously (avoid overlap). Typical node size 180x80.
- Connect related nodes with arrows from edge to edge.
- Keep "text" inside nodes short (under 6 words).
- Output ONLY valid JSON, nothing else.`;

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (resp.status === 429) throw new Error("AI rate limit reached. Try again in a moment.");
    if (resp.status === 402) throw new Error("AI credits exhausted. Please add credits in workspace settings.");
    if (!resp.ok) throw new Error(`AI gateway error: ${resp.status}`);

    const json = await resp.json();
    let parsed: { title?: string; elements: DiagramElement[] };
    try {
      parsed = JSON.parse(json.choices?.[0]?.message?.content ?? "{}");
    } catch {
      throw new Error("AI returned invalid JSON");
    }
    if (!parsed.elements || !Array.isArray(parsed.elements)) {
      throw new Error("AI returned no elements");
    }

    // Offset everything so it lands on the user's current viewport area
    const offsetX = 80;
    const offsetY = 80;

    const groupId = crypto.randomUUID();
    const rows = parsed.elements.map((el, i) => {
      const color = PALETTE[i % PALETTE.length];
      const base = {
        meeting_id: meetingId,
        user_id: userId,
        color,
        z_index: 100 + i,
      };
      if (el.kind === "arrow") {
        return {
          ...base,
          kind: "arrow" as const,
          data: {
            group: groupId,
            x1: (el.x1 ?? 0) + offsetX,
            y1: (el.y1 ?? 0) + offsetY,
            x2: (el.x2 ?? 0) + offsetX,
            y2: (el.y2 ?? 0) + offsetY,
          },
        };
      }
      if (el.kind === "text") {
        return {
          ...base,
          kind: "text" as const,
          data: { group: groupId, x: (el.x ?? 0) + offsetX, y: (el.y ?? 0) + offsetY, text: el.text ?? "" },
        };
      }
      return {
        ...base,
        kind: el.kind as "rect" | "ellipse" | "note",
        data: {
          group: groupId,
          x: (el.x ?? 0) + offsetX,
          y: (el.y ?? 0) + offsetY,
          w: el.w ?? 180,
          h: el.h ?? 80,
          text: el.text ?? "",
        },
      };
    });

    const { error } = await supabase.from("whiteboard_elements").insert(rows);
    if (error) throw new Error(error.message);

    return { ok: true, count: rows.length, title: parsed.title ?? prompt };
  });
