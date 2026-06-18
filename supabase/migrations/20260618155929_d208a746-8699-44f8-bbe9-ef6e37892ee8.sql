
-- Transcripts: every spoken segment
CREATE TABLE public.meeting_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  speaker_name text,
  content text NOT NULL,
  language text DEFAULT 'en',
  started_at_ms integer NOT NULL DEFAULT 0,
  ended_at_ms integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_transcripts_meeting ON public.meeting_transcripts(meeting_id, started_at_ms);
CREATE INDEX idx_transcripts_search ON public.meeting_transcripts USING gin (to_tsvector('english', content));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_transcripts TO authenticated;
GRANT ALL ON public.meeting_transcripts TO service_role;
ALTER TABLE public.meeting_transcripts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read transcripts" ON public.meeting_transcripts
  FOR SELECT TO authenticated
  USING (public.can_access_meeting(meeting_id, auth.uid()));

CREATE POLICY "self insert transcripts" ON public.meeting_transcripts
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_access_meeting(meeting_id, auth.uid()));

-- Summaries: one per meeting
CREATE TABLE public.meeting_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL UNIQUE REFERENCES public.meetings(id) ON DELETE CASCADE,
  title text,
  summary text NOT NULL,
  topics jsonb NOT NULL DEFAULT '[]'::jsonb,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_seconds integer DEFAULT 0,
  generated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_summaries TO authenticated;
GRANT ALL ON public.meeting_summaries TO service_role;
ALTER TABLE public.meeting_summaries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read summary" ON public.meeting_summaries
  FOR SELECT TO authenticated
  USING (public.can_access_meeting(meeting_id, auth.uid()));

CREATE POLICY "host writes summary" ON public.meeting_summaries
  FOR ALL TO authenticated
  USING (public.is_meeting_host(meeting_id, auth.uid()))
  WITH CHECK (public.is_meeting_host(meeting_id, auth.uid()));

CREATE TRIGGER trg_summaries_updated BEFORE UPDATE ON public.meeting_summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Action items
CREATE TABLE public.meeting_action_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  assignee_name text NOT NULL,
  assignee_user_id uuid,
  task text NOT NULL,
  deadline text,
  status text NOT NULL DEFAULT 'open',
  source_timestamp_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_action_items_meeting ON public.meeting_action_items(meeting_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_action_items TO authenticated;
GRANT ALL ON public.meeting_action_items TO service_role;
ALTER TABLE public.meeting_action_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read actions" ON public.meeting_action_items
  FOR SELECT TO authenticated
  USING (public.can_access_meeting(meeting_id, auth.uid()));

CREATE POLICY "host writes actions" ON public.meeting_action_items
  FOR ALL TO authenticated
  USING (public.is_meeting_host(meeting_id, auth.uid()))
  WITH CHECK (public.is_meeting_host(meeting_id, auth.uid()));

CREATE TRIGGER trg_actions_updated BEFORE UPDATE ON public.meeting_action_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
