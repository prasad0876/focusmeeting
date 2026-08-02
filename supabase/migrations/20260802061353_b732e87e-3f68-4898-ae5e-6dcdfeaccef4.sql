DROP POLICY "Invitee joins meeting" ON public.meeting_participants;
CREATE POLICY "Invitee joins meeting" ON public.meeting_participants
FOR INSERT TO authenticated
WITH CHECK (
  (auth.uid() = user_id) AND (is_removed = false) AND (
    private.is_meeting_host(meeting_id, auth.uid()) OR EXISTS (
      SELECT 1 FROM public.meeting_invitations mi
      WHERE mi.meeting_id = meeting_participants.meeting_id
        AND mi.invitee_id = auth.uid()
        AND mi.status = 'accepted'::invitation_status
    )
  ) AND NOT EXISTS (
    SELECT 1 FROM public.meeting_participants existing
    WHERE existing.meeting_id = meeting_participants.meeting_id
      AND existing.user_id = auth.uid()
      AND existing.is_removed = true
  )
);