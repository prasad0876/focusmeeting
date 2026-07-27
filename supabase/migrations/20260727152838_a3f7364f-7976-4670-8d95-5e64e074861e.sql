
-- 1) Profiles: prevent self-escalation of protected columns
CREATE OR REPLACE FUNCTION private.profiles_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF private.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.id THEN
    NEW.status := OLD.status;
    NEW.is_blacklisted := OLD.is_blacklisted;
    NEW.reputation := OLD.reputation;
    NEW.department_id := OLD.department_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_guard_self_update ON public.profiles;
CREATE TRIGGER profiles_guard_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION private.profiles_guard_self_update();

-- 2) meeting_participants: prevent self-clearing of is_removed/is_muted
CREATE OR REPLACE FUNCTION private.mp_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF private.is_admin(auth.uid()) OR private.is_meeting_host(NEW.meeting_id, auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF auth.uid() = OLD.user_id THEN
    NEW.is_removed := OLD.is_removed;
    NEW.is_muted := OLD.is_muted;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS mp_guard_self_update ON public.meeting_participants;
CREATE TRIGGER mp_guard_self_update
BEFORE UPDATE ON public.meeting_participants
FOR EACH ROW EXECUTE FUNCTION private.mp_guard_self_update();

-- Also block removed users from re-inserting themselves as an active participant
DROP POLICY IF EXISTS "Invitee joins meeting" ON public.meeting_participants;
CREATE POLICY "Invitee joins meeting" ON public.meeting_participants
FOR INSERT
WITH CHECK (
  (auth.uid() = user_id)
  AND (is_removed = false)
  AND (
    private.is_meeting_host(meeting_id, auth.uid())
    OR EXISTS (
      SELECT 1 FROM meeting_invitations mi
      WHERE mi.meeting_id = meeting_participants.meeting_id
        AND mi.invitee_id = auth.uid()
        AND mi.status = 'accepted'::invitation_status
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.meeting_participants existing
    WHERE existing.meeting_id = meeting_participants.meeting_id
      AND existing.user_id = auth.uid()
      AND existing.is_removed = true
  )
);

-- 3) assessment_submissions: prevent students from writing grading fields
CREATE OR REPLACE FUNCTION private.as_guard_student_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_grader boolean;
BEGIN
  IF private.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = NEW.assessment_id
      AND (
        a.created_by = auth.uid()
        OR private.faculty_of_section(auth.uid(), a.section_id)
        OR EXISTS (
          SELECT 1 FROM public.sections s
          WHERE s.id = a.section_id
            AND private.is_hod_of(auth.uid(), s.department_id)
        )
      )
  ) INTO is_grader;

  IF is_grader THEN
    RETURN NEW;
  END IF;

  -- Non-grader (i.e. the student themselves): freeze grading fields
  NEW.score := OLD.score;
  NEW.feedback := OLD.feedback;
  NEW.graded_by := OLD.graded_by;
  NEW.graded_at := OLD.graded_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS as_guard_student_update ON public.assessment_submissions;
CREATE TRIGGER as_guard_student_update
BEFORE UPDATE ON public.assessment_submissions
FOR EACH ROW EXECUTE FUNCTION private.as_guard_student_update();
