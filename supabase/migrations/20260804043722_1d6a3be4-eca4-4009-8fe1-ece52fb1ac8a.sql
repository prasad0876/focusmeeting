CREATE OR REPLACE FUNCTION private.as_guard_student_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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

  IF is_grader OR public.has_role(auth.uid(), 'deo') THEN
    RETURN NEW;
  END IF;

  -- Non-grader (e.g. the student): grading columns are immutable, and only
  -- the student's own submission body may change.
  IF NEW.score IS DISTINCT FROM OLD.score
     OR NEW.feedback IS DISTINCT FROM OLD.feedback
     OR NEW.graded_by IS DISTINCT FROM OLD.graded_by
     OR NEW.graded_at IS DISTINCT FROM OLD.graded_at THEN
    RAISE EXCEPTION 'Not allowed: only faculty or administrators can grade submissions';
  END IF;

  NEW.student_id := OLD.student_id;
  NEW.assessment_id := OLD.assessment_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.mp_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF private.is_admin(auth.uid()) OR private.is_meeting_host(NEW.meeting_id, auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.is_removed IS DISTINCT FROM OLD.is_removed
     OR NEW.is_muted IS DISTINCT FROM OLD.is_muted THEN
    RAISE EXCEPTION 'Not allowed: only the meeting host or an administrator can change moderation state';
  END IF;

  NEW.user_id := OLD.user_id;
  NEW.meeting_id := OLD.meeting_id;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION private.profiles_guard_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF private.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status
     OR NEW.is_blacklisted IS DISTINCT FROM OLD.is_blacklisted
     OR NEW.reputation IS DISTINCT FROM OLD.reputation
     OR NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    RAISE EXCEPTION 'Not allowed: account status, reputation and department are managed by administrators';
  END IF;

  NEW.id := OLD.id;
  RETURN NEW;
END;
$function$;