
CREATE TABLE public.whiteboard_elements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('stroke','note','text','rect','ellipse','arrow','ai-group')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  color TEXT NOT NULL DEFAULT '#6366f1',
  z_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whiteboard_elements TO authenticated;
GRANT ALL ON public.whiteboard_elements TO service_role;

ALTER TABLE public.whiteboard_elements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Meeting members can view whiteboard"
  ON public.whiteboard_elements FOR SELECT TO authenticated
  USING (public.can_access_meeting(meeting_id, auth.uid()));

CREATE POLICY "Meeting members can add elements"
  ON public.whiteboard_elements FOR INSERT TO authenticated
  WITH CHECK (public.can_access_meeting(meeting_id, auth.uid()) AND user_id = auth.uid());

CREATE POLICY "Authors or host can update elements"
  ON public.whiteboard_elements FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.is_meeting_host(meeting_id, auth.uid()));

CREATE POLICY "Authors or host can delete elements"
  ON public.whiteboard_elements FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.is_meeting_host(meeting_id, auth.uid()));

CREATE INDEX whiteboard_elements_meeting_idx ON public.whiteboard_elements(meeting_id, created_at);

CREATE TRIGGER trg_whiteboard_updated_at
  BEFORE UPDATE ON public.whiteboard_elements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER PUBLICATION supabase_realtime ADD TABLE public.whiteboard_elements;
