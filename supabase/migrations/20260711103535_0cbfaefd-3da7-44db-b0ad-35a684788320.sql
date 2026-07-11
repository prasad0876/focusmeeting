
CREATE TABLE public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  due_at TIMESTAMPTZ,
  max_score INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View assessments in accessible sections" ON public.assessments
  FOR SELECT TO authenticated USING (
    public.is_admin(auth.uid())
    OR created_by = auth.uid()
    OR public.faculty_of_section(auth.uid(), section_id)
    OR public.student_of_section(auth.uid(), section_id)
    OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND public.is_hod_of(auth.uid(), s.department_id))
  );

CREATE POLICY "Faculty/HOD/Admin create assessments" ON public.assessments
  FOR INSERT TO authenticated WITH CHECK (
    created_by = auth.uid() AND (
      public.is_admin(auth.uid())
      OR public.faculty_of_section(auth.uid(), section_id)
      OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND public.is_hod_of(auth.uid(), s.department_id))
    )
  );

CREATE POLICY "Creator/HOD/Admin update assessment" ON public.assessments
  FOR UPDATE TO authenticated USING (
    public.is_admin(auth.uid())
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND public.is_hod_of(auth.uid(), s.department_id))
  );

CREATE POLICY "Creator/HOD/Admin delete assessment" ON public.assessments
  FOR DELETE TO authenticated USING (
    public.is_admin(auth.uid())
    OR created_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND public.is_hod_of(auth.uid(), s.department_id))
  );

CREATE TRIGGER trg_assessments_updated_at BEFORE UPDATE ON public.assessments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.assessment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  score INTEGER,
  feedback TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  graded_at TIMESTAMPTZ,
  graded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, student_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_submissions TO authenticated;
GRANT ALL ON public.assessment_submissions TO service_role;
ALTER TABLE public.assessment_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own submission or as faculty/hod/admin" ON public.assessment_submissions
  FOR SELECT TO authenticated USING (
    student_id = auth.uid()
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (
        a.created_by = auth.uid()
        OR public.faculty_of_section(auth.uid(), a.section_id)
        OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = a.section_id AND public.is_hod_of(auth.uid(), s.department_id))
      )
    )
  );

CREATE POLICY "Students submit to their section" ON public.assessment_submissions
  FOR INSERT TO authenticated WITH CHECK (
    student_id = auth.uid() AND EXISTS (
      SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND public.student_of_section(auth.uid(), a.section_id)
    )
  );

CREATE POLICY "Student edits own, faculty/hod/admin grade" ON public.assessment_submissions
  FOR UPDATE TO authenticated USING (
    (student_id = auth.uid() AND graded_at IS NULL)
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (
        a.created_by = auth.uid()
        OR public.faculty_of_section(auth.uid(), a.section_id)
        OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = a.section_id AND public.is_hod_of(auth.uid(), s.department_id))
      )
    )
  );

CREATE POLICY "Student deletes own ungraded, faculty/admin any" ON public.assessment_submissions
  FOR DELETE TO authenticated USING (
    (student_id = auth.uid() AND graded_at IS NULL)
    OR public.is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND (
        a.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = a.section_id AND public.is_hod_of(auth.uid(), s.department_id))
      )
    )
  );

CREATE TRIGGER trg_submissions_updated_at BEFORE UPDATE ON public.assessment_submissions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
