CREATE OR REPLACE FUNCTION private.can_access_meeting(_meeting uuid, _user uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    private.is_admin(_user)
    OR EXISTS (SELECT 1 FROM public.meetings WHERE id = _meeting AND host_id = _user)
    OR EXISTS (SELECT 1 FROM public.meeting_invitations WHERE meeting_id = _meeting AND invitee_id = _user)
    OR EXISTS (SELECT 1 FROM public.meeting_participants WHERE meeting_id = _meeting AND user_id = _user)
    OR EXISTS (
      SELECT 1 FROM public.meetings m WHERE m.id = _meeting AND (
        m.scope = 'university'
        OR (m.scope = 'department' AND m.department_id IS NOT NULL AND private.in_department(_user, m.department_id))
        OR (m.scope = 'section' AND m.section_id IS NOT NULL AND (private.faculty_of_section(_user, m.section_id) OR private.student_of_section(_user, m.section_id)))
      )
    );
$function$;