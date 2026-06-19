import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generateWhiteboardDiagram } from "@/lib/whiteboard.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Pen, StickyNote, Square, Circle, Type, MousePointer2, Trash2, Sparkles, X, Eraser,
} from "lucide-react";
import { toast } from "sonner";

type Element = {
  id: string;
  meeting_id: string;
  user_id: string;
  kind: "stroke" | "note" | "text" | "rect" | "ellipse" | "arrow";
  data: any;
  color: string;
  z_index: number;
};

const COLORS = ["#6366f1", "#ec4899", "#22c55e", "#f59e0b", "#06b6d4", "#ef4444", "#0f172a"];
type Tool = "select" | "pen" | "note" | "rect" | "ellipse" | "text" | "eraser";

export function Whiteboard({
  meetingId,
  userId,
  onClose,
}: {
  meetingId: string;
  userId: string;
  onClose: () => void;
}) {
  const [elements, setElements] = useState<Element[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [drawing, setDrawing] = useState<{ id: string; points: { x: number; y: number }[] } | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [dragging, setDragging] = useState<{ id: string; offsetX: number; offsetY: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const generateFn = useServerFn(generateWhiteboardDiagram);

  // Load + realtime
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("whiteboard_elements")
        .select("*")
        .eq("meeting_id", meetingId)
        .order("created_at", { ascending: true });
      if (mounted && data) setElements(data as Element[]);
    })();

    const channel = supabase
      .channel(`wb:${meetingId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "whiteboard_elements", filter: `meeting_id=eq.${meetingId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setElements((prev) =>
              prev.some((e) => e.id === (payload.new as Element).id) ? prev : [...prev, payload.new as Element],
            );
          } else if (payload.eventType === "UPDATE") {
            setElements((prev) => prev.map((e) => (e.id === (payload.new as Element).id ? (payload.new as Element) : e)));
          } else if (payload.eventType === "DELETE") {
            setElements((prev) => prev.filter((e) => e.id !== (payload.old as Element).id));
          }
        },
      )
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [meetingId]);

  const getPoint = useCallback((e: React.PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1200;
    const y = ((e.clientY - rect.top) / rect.height) * 700;
    return { x, y };
  }, []);

  const persistInsert = async (kind: Element["kind"], data: any) => {
    const { data: row, error } = await supabase
      .from("whiteboard_elements")
      .insert({ meeting_id: meetingId, user_id: userId, kind, data, color, z_index: elements.length + 1 })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return null;
    }
    setElements((prev) => (prev.some((e) => e.id === row.id) ? prev : [...prev, row as Element]));
    return row as Element;
  };

  const persistUpdate = async (id: string, data: any) => {
    setElements((prev) => prev.map((e) => (e.id === id ? { ...e, data } : e)));
    await supabase.from("whiteboard_elements").update({ data }).eq("id", id);
  };

  const persistDelete = async (id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    await supabase.from("whiteboard_elements").delete().eq("id", id);
  };

  const onPointerDown = async (e: React.PointerEvent) => {
    if (editingId) return;
    const p = getPoint(e);

    if (tool === "pen") {
      const tempId = `tmp-${Date.now()}`;
      setDrawing({ id: tempId, points: [p] });
      (e.target as unknown as { setPointerCapture?: (id: number) => void }).setPointerCapture?.(e.pointerId);
    } else if (tool === "note") {
      await persistInsert("note", { x: p.x - 90, y: p.y - 50, w: 180, h: 120, text: "Note" });
    } else if (tool === "rect") {
      await persistInsert("rect", { x: p.x - 80, y: p.y - 40, w: 160, h: 80, text: "" });
    } else if (tool === "ellipse") {
      await persistInsert("ellipse", { x: p.x - 80, y: p.y - 40, w: 160, h: 80, text: "" });
    } else if (tool === "text") {
      const el = await persistInsert("text", { x: p.x, y: p.y, text: "Text" });
      if (el) setEditingId(el.id);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (drawing) {
      const p = getPoint(e);
      setDrawing((d) => (d ? { ...d, points: [...d.points, p] } : null));
    }
    if (dragging) {
      const p = getPoint(e);
      setElements((prev) =>
        prev.map((el) =>
          el.id === dragging.id ? { ...el, data: { ...el.data, x: p.x - dragging.offsetX, y: p.y - dragging.offsetY } } : el,
        ),
      );
    }
  };

  const onPointerUp = async () => {
    if (drawing && drawing.points.length > 1) {
      await persistInsert("stroke", { points: drawing.points });
    }
    setDrawing(null);
    if (dragging) {
      const el = elements.find((e) => e.id === dragging.id);
      if (el) await supabase.from("whiteboard_elements").update({ data: el.data }).eq("id", el.id);
      setDragging(null);
    }
  };

  const startDrag = (e: React.PointerEvent, el: Element) => {
    if (tool !== "select") return;
    e.stopPropagation();
    const p = getPoint(e);
    setDragging({ id: el.id, offsetX: p.x - (el.data.x ?? 0), offsetY: p.y - (el.data.y ?? 0) });
  };

  const handleErase = async (e: React.MouseEvent, el: Element) => {
    if (tool !== "eraser") return;
    e.stopPropagation();
    await persistDelete(el.id);
  };

  const runAi = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiPrompt.trim()) return;
    setAiBusy(true);
    try {
      const res = await generateFn({ data: { meetingId, prompt: aiPrompt.trim(), mode: "flow" } });
      toast.success(`AI added ${res.count} elements`);
      setAiPrompt("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI failed");
    } finally {
      setAiBusy(false);
    }
  };

  const clearAll = async () => {
    if (!confirm("Clear the whole whiteboard?")) return;
    const ids = elements.map((e) => e.id);
    setElements([]);
    if (ids.length) await supabase.from("whiteboard_elements").delete().in("id", ids);
  };

  const sortedElements = useMemo(() => [...elements].sort((a, b) => a.z_index - b.z_index), [elements]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col">
      {/* Toolbar */}
      <div className="border-b border-border/60 px-4 py-3 flex items-center gap-2 flex-wrap bg-surface">
        <div className="flex items-center gap-1">
          <ToolBtn active={tool === "select"} onClick={() => setTool("select")} title="Select / move"><MousePointer2 className="size-4" /></ToolBtn>
          <ToolBtn active={tool === "pen"} onClick={() => setTool("pen")} title="Pen"><Pen className="size-4" /></ToolBtn>
          <ToolBtn active={tool === "note"} onClick={() => setTool("note")} title="Sticky note"><StickyNote className="size-4" /></ToolBtn>
          <ToolBtn active={tool === "rect"} onClick={() => setTool("rect")} title="Rectangle"><Square className="size-4" /></ToolBtn>
          <ToolBtn active={tool === "ellipse"} onClick={() => setTool("ellipse")} title="Ellipse"><Circle className="size-4" /></ToolBtn>
          <ToolBtn active={tool === "text"} onClick={() => setTool("text")} title="Text"><Type className="size-4" /></ToolBtn>
          <ToolBtn active={tool === "eraser"} onClick={() => setTool("eraser")} title="Eraser"><Eraser className="size-4" /></ToolBtn>
        </div>
        <div className="w-px h-6 bg-border/60" />
        <div className="flex items-center gap-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              title={c}
              className={`size-6 rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-border/60"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        <form onSubmit={runAi} className="flex items-center gap-2 ml-auto flex-1 max-w-xl">
          <div className="relative flex-1">
            <Sparkles className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-primary" />
            <Input
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="Describe a diagram… e.g. 'user signup flow with email verification'"
              className="pl-8"
              disabled={aiBusy}
            />
          </div>
          <Button type="submit" size="sm" disabled={aiBusy || !aiPrompt.trim()}>
            {aiBusy ? "Thinking…" : "Generate"}
          </Button>
        </form>

        <Button variant="ghost" size="sm" onClick={clearAll} className="text-destructive">
          <Trash2 className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden bg-[radial-gradient(circle_at_1px_1px,_hsl(var(--border))_1px,_transparent_0)] [background-size:24px_24px]">
        <svg
          ref={svgRef}
          viewBox="0 0 1200 700"
          preserveAspectRatio="xMidYMid meet"
          className={`w-full h-full ${tool === "pen" ? "cursor-crosshair" : tool === "eraser" ? "cursor-not-allowed" : "cursor-default"}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        >
          <defs>
            <marker id="wb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>

          {sortedElements.map((el) => {
            const onErase = (e: React.MouseEvent) => handleErase(e, el);
            const onDrag = (e: React.PointerEvent) => startDrag(e, el);

            if (el.kind === "stroke") {
              const pts = (el.data.points ?? []) as { x: number; y: number }[];
              if (pts.length < 2) return null;
              const d = pts.reduce((acc, p, i) => acc + `${i === 0 ? "M" : "L"} ${p.x} ${p.y} `, "");
              return <path key={el.id} d={d} stroke={el.color} strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" onClick={onErase} />;
            }
            if (el.kind === "note") {
              return (
                <foreignObject
                  key={el.id}
                  x={el.data.x}
                  y={el.data.y}
                  width={el.data.w}
                  height={el.data.h}
                  onPointerDown={onDrag}
                  onClick={onErase}
                >
                  <div
                    className="w-full h-full p-2 text-xs shadow-lg rounded-sm overflow-hidden"
                    style={{ backgroundColor: el.color + "33", border: `2px solid ${el.color}` }}
                  >
                    {editingId === el.id ? (
                      <textarea
                        autoFocus
                        defaultValue={el.data.text}
                        onBlur={(e) => { persistUpdate(el.id, { ...el.data, text: e.target.value }); setEditingId(null); }}
                        className="w-full h-full bg-transparent outline-none resize-none text-foreground"
                      />
                    ) : (
                      <div
                        onDoubleClick={() => setEditingId(el.id)}
                        className="w-full h-full whitespace-pre-wrap text-foreground"
                      >
                        {el.data.text}
                      </div>
                    )}
                  </div>
                </foreignObject>
              );
            }
            if (el.kind === "rect" || el.kind === "ellipse") {
              const Shape = el.kind === "rect" ? "rect" : "ellipse";
              const shapeProps = el.kind === "rect"
                ? { x: el.data.x, y: el.data.y, width: el.data.w, height: el.data.h, rx: 8 }
                : { cx: el.data.x + el.data.w / 2, cy: el.data.y + el.data.h / 2, rx: el.data.w / 2, ry: el.data.h / 2 };
              const ShapeEl = Shape as unknown as React.ComponentType<Record<string, unknown>>;
              return (
                <g key={el.id} onPointerDown={onDrag} onClick={onErase}>
                  <ShapeEl {...shapeProps} fill={el.color + "22"} stroke={el.color} strokeWidth={2} />
                  <foreignObject x={el.data.x} y={el.data.y} width={el.data.w} height={el.data.h} pointerEvents="none">
                    <div className="w-full h-full grid place-items-center text-xs font-medium text-foreground text-center px-2">
                      {el.data.text}
                    </div>
                  </foreignObject>
                </g>
              );
            }
            if (el.kind === "arrow") {
              return (
                <line
                  key={el.id}
                  x1={el.data.x1}
                  y1={el.data.y1}
                  x2={el.data.x2}
                  y2={el.data.y2}
                  stroke={el.color}
                  strokeWidth={2}
                  markerEnd="url(#wb-arrow)"
                  style={{ color: el.color }}
                  onClick={onErase}
                />
              );
            }
            if (el.kind === "text") {
              return (
                <foreignObject key={el.id} x={el.data.x} y={el.data.y} width={240} height={40} onPointerDown={onDrag} onClick={onErase}>
                  {editingId === el.id ? (
                    <input
                      autoFocus
                      defaultValue={el.data.text}
                      onBlur={(e) => { persistUpdate(el.id, { ...el.data, text: e.target.value }); setEditingId(null); }}
                      className="bg-transparent outline-none text-sm font-medium"
                      style={{ color: el.color }}
                    />
                  ) : (
                    <div
                      onDoubleClick={() => setEditingId(el.id)}
                      className="text-sm font-medium"
                      style={{ color: el.color }}
                    >
                      {el.data.text}
                    </div>
                  )}
                </foreignObject>
              );
            }
            return null;
          })}

          {/* Live in-progress stroke */}
          {drawing && drawing.points.length > 1 && (
            <path
              d={drawing.points.reduce((acc, p, i) => acc + `${i === 0 ? "M" : "L"} ${p.x} ${p.y} `, "")}
              stroke={color}
              strokeWidth={3}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>

      <div className="border-t border-border/60 px-4 py-2 text-[11px] font-mono text-muted-foreground flex items-center justify-between">
        <span>{elements.length} elements · realtime synced</span>
        <span>Tip: switch to Select to drag, double-click notes/text to edit</span>
      </div>
    </div>
  );
}

function ToolBtn({ active, onClick, children, title }: { active: boolean; onClick: () => void; children: React.ReactNode; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`size-8 grid place-items-center rounded-md border transition ${
        active ? "bg-primary text-primary-foreground border-primary" : "bg-secondary/40 border-border/60 hover:bg-secondary"
      }`}
    >
      {children}
    </button>
  );
}
