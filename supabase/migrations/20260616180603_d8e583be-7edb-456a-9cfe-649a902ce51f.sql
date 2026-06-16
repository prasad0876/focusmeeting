
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TYPE public.invitation_status AS ENUM ('pending', 'accepted', 'declined', 'cancelled');
CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'live', 'ended');
CREATE TYPE public.abuse_severity AS ENUM ('low', 'moderate', 'high', 'severe');

-- Updated-at helper
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  handle text NOT NULL UNIQUE,
  display_name text NOT NULL,
  avatar_url text,
  reputation int NOT NULL DEFAULT 100,
  is_blacklisted boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can view profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Roles
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- Handle generation + profile auto-create
CREATE OR REPLACE FUNCTION public.generate_unique_handle(_base text)
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  base text;
  candidate text;
  i int := 0;
BEGIN
  base := lower(regexp_replace(coalesce(_base, 'user'), '[^a-z0-9]+', '', 'gi'));
  IF length(base) < 3 THEN base := base || 'user'; END IF;
  base := substr(base, 1, 16);
  candidate := base || floor(random()*9000+1000)::text;
  WHILE EXISTS (SELECT 1 FROM public.profiles WHERE handle = candidate) AND i < 10 LOOP
    candidate := base || floor(random()*900000+100000)::text;
    i := i + 1;
  END LOOP;
  RETURN candidate;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text;
  _handle text;
BEGIN
  _name := coalesce(NEW.raw_user_meta_data->>'display_name',
                    NEW.raw_user_meta_data->>'full_name',
                    NEW.raw_user_meta_data->>'name',
                    split_part(NEW.email, '@', 1));
  _handle := public.generate_unique_handle(coalesce(NEW.raw_user_meta_data->>'handle', _name, 'user'));
  INSERT INTO public.profiles (id, handle, display_name, avatar_url)
  VALUES (NEW.id, _handle, coalesce(_name, _handle), NEW.raw_user_meta_data->>'avatar_url');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Meetings
CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  status public.meeting_status NOT NULL DEFAULT 'scheduled',
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meetings TO authenticated;
GRANT ALL ON public.meetings TO service_role;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_meetings_updated BEFORE UPDATE ON public.meetings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Invitations
CREATE TABLE public.meeting_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status public.invitation_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (meeting_id, invitee_id)
);
CREATE INDEX idx_invitations_invitee ON public.meeting_invitations(invitee_id, status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_invitations TO authenticated;
GRANT ALL ON public.meeting_invitations TO service_role;
ALTER TABLE public.meeting_invitations ENABLE ROW LEVEL SECURITY;

-- Participants
CREATE TABLE public.meeting_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  is_muted boolean NOT NULL DEFAULT false,
  is_removed boolean NOT NULL DEFAULT false,
  focus_score int NOT NULL DEFAULT 100,
  UNIQUE (meeting_id, user_id)
);
CREATE INDEX idx_participants_meeting ON public.meeting_participants(meeting_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.meeting_participants TO authenticated;
GRANT ALL ON public.meeting_participants TO service_role;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;

-- Helper: am I in this meeting (host or active participant)?
CREATE OR REPLACE FUNCTION public.can_access_meeting(_meeting uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.meetings WHERE id = _meeting AND host_id = _user)
      OR EXISTS (SELECT 1 FROM public.meeting_invitations WHERE meeting_id = _meeting AND invitee_id = _user)
      OR EXISTS (SELECT 1 FROM public.meeting_participants WHERE meeting_id = _meeting AND user_id = _user);
$$;

CREATE OR REPLACE FUNCTION public.is_meeting_host(_meeting uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.meetings WHERE id = _meeting AND host_id = _user);
$$;

-- Meetings policies
CREATE POLICY "Hosts and invitees see meeting" ON public.meetings FOR SELECT TO authenticated
USING (auth.uid() = host_id OR public.can_access_meeting(id, auth.uid()));
CREATE POLICY "Authenticated create meetings" ON public.meetings FOR INSERT TO authenticated
WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts update own meetings" ON public.meetings FOR UPDATE TO authenticated
USING (auth.uid() = host_id) WITH CHECK (auth.uid() = host_id);
CREATE POLICY "Hosts delete own meetings" ON public.meetings FOR DELETE TO authenticated
USING (auth.uid() = host_id);

-- Invitations policies
CREATE POLICY "Invitee or host views invitation" ON public.meeting_invitations FOR SELECT TO authenticated
USING (auth.uid() = invitee_id OR auth.uid() = inviter_id OR public.is_meeting_host(meeting_id, auth.uid()));
CREATE POLICY "Host invites users" ON public.meeting_invitations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = inviter_id AND public.is_meeting_host(meeting_id, auth.uid()));
CREATE POLICY "Invitee responds or host cancels" ON public.meeting_invitations FOR UPDATE TO authenticated
USING (auth.uid() = invitee_id OR public.is_meeting_host(meeting_id, auth.uid()))
WITH CHECK (auth.uid() = invitee_id OR public.is_meeting_host(meeting_id, auth.uid()));
CREATE POLICY "Host deletes invitation" ON public.meeting_invitations FOR DELETE TO authenticated
USING (public.is_meeting_host(meeting_id, auth.uid()));

-- Participants policies
CREATE POLICY "Participants in same meeting see each other" ON public.meeting_participants FOR SELECT TO authenticated
USING (public.can_access_meeting(meeting_id, auth.uid()));
CREATE POLICY "Invitee joins meeting" ON public.meeting_participants FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id AND (
    public.is_meeting_host(meeting_id, auth.uid())
    OR EXISTS (SELECT 1 FROM public.meeting_invitations mi WHERE mi.meeting_id = meeting_participants.meeting_id AND mi.invitee_id = auth.uid() AND mi.status = 'accepted')
  )
);
CREATE POLICY "Self or host updates participant" ON public.meeting_participants FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.is_meeting_host(meeting_id, auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_meeting_host(meeting_id, auth.uid()));

-- Messages
CREATE TABLE public.meeting_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content text NOT NULL,
  is_flagged boolean NOT NULL DEFAULT false,
  severity public.abuse_severity,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_meeting ON public.meeting_messages(meeting_id, created_at);
GRANT SELECT, INSERT ON public.meeting_messages TO authenticated;
GRANT ALL ON public.meeting_messages TO service_role;
ALTER TABLE public.meeting_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Meeting members view messages" ON public.meeting_messages FOR SELECT TO authenticated
USING (public.can_access_meeting(meeting_id, auth.uid()));
CREATE POLICY "Members send messages" ON public.meeting_messages FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_access_meeting(meeting_id, auth.uid()));

-- Abuse incidents
CREATE TABLE public.abuse_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.meeting_messages(id) ON DELETE SET NULL,
  severity public.abuse_severity NOT NULL,
  category text NOT NULL,
  excerpt text,
  action_taken text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_meeting ON public.abuse_incidents(meeting_id);
GRANT SELECT, INSERT ON public.abuse_incidents TO authenticated;
GRANT ALL ON public.abuse_incidents TO service_role;
ALTER TABLE public.abuse_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Host views meeting incidents" ON public.abuse_incidents FOR SELECT TO authenticated
USING (public.is_meeting_host(meeting_id, auth.uid()) OR auth.uid() = user_id);
CREATE POLICY "Server inserts incidents (auth)" ON public.abuse_incidents FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Focus samples (aggregated)
CREATE TABLE public.focus_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  focus_score int NOT NULL CHECK (focus_score BETWEEN 0 AND 100),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_focus_meeting ON public.focus_samples(meeting_id, created_at);
GRANT SELECT, INSERT ON public.focus_samples TO authenticated;
GRANT ALL ON public.focus_samples TO service_role;
ALTER TABLE public.focus_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Host views all focus, user views own" ON public.focus_samples FOR SELECT TO authenticated
USING (public.is_meeting_host(meeting_id, auth.uid()) OR auth.uid() = user_id);
CREATE POLICY "Self reports focus" ON public.focus_samples FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND public.can_access_meeting(meeting_id, auth.uid()));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_invitations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meeting_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.focus_samples;
ALTER PUBLICATION supabase_realtime ADD TABLE public.abuse_incidents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.meetings;
