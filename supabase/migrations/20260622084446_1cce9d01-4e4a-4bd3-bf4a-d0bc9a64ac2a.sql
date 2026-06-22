
-- Admin helper (wraps has_role for brevity)
CREATE OR REPLACE FUNCTION public.is_admin(_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.has_role(_user, 'admin'::app_role) $$;

-- profiles
CREATE POLICY "Admins update any profile" ON public.profiles
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

-- meetings
CREATE POLICY "Admins view all meetings" ON public.meetings
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins update any meeting" ON public.meetings
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete any meeting" ON public.meetings
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- meeting_participants
CREATE POLICY "Admins view all participants" ON public.meeting_participants
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins update any participant" ON public.meeting_participants
  FOR UPDATE TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete any participant" ON public.meeting_participants
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- meeting_transcripts
CREATE POLICY "Admins view all transcripts" ON public.meeting_transcripts
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete any transcript" ON public.meeting_transcripts
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- whiteboard_elements
CREATE POLICY "Admins view all whiteboard" ON public.whiteboard_elements
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete any whiteboard element" ON public.whiteboard_elements
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- meeting_summaries
CREATE POLICY "Admins view all summaries" ON public.meeting_summaries
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete any summary" ON public.meeting_summaries
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- meeting_messages
CREATE POLICY "Admins view all messages" ON public.meeting_messages
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins delete any message" ON public.meeting_messages
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));

-- abuse_incidents
CREATE POLICY "Admins view all abuse incidents" ON public.abuse_incidents
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- meeting_action_items
CREATE POLICY "Admins view all action items" ON public.meeting_action_items
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- meeting_invitations
CREATE POLICY "Admins view all invitations" ON public.meeting_invitations
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- focus_samples
CREATE POLICY "Admins view all focus" ON public.focus_samples
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- user_roles (grant / revoke admin)
CREATE POLICY "Admins view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));
CREATE POLICY "Admins grant roles" ON public.user_roles
  FOR INSERT TO authenticated WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "Admins revoke roles" ON public.user_roles
  FOR DELETE TO authenticated USING (public.is_admin(auth.uid()));
