DROP POLICY IF EXISTS "Host invites users" ON public.meeting_invitations;
CREATE POLICY "Host or admin invites users" ON public.meeting_invitations
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = inviter_id
  AND (is_meeting_host(meeting_id, auth.uid()) OR is_admin(auth.uid()))
);

DROP POLICY IF EXISTS "Invitee responds or host cancels" ON public.meeting_invitations;
CREATE POLICY "Invitee responds or host/admin cancels" ON public.meeting_invitations
FOR UPDATE TO authenticated
USING (auth.uid() = invitee_id OR is_meeting_host(meeting_id, auth.uid()) OR is_admin(auth.uid()))
WITH CHECK (auth.uid() = invitee_id OR is_meeting_host(meeting_id, auth.uid()) OR is_admin(auth.uid()));

DROP POLICY IF EXISTS "Host deletes invitation" ON public.meeting_invitations;
CREATE POLICY "Host or admin deletes invitation" ON public.meeting_invitations
FOR DELETE TO authenticated
USING (is_meeting_host(meeting_id, auth.uid()) OR is_admin(auth.uid()));