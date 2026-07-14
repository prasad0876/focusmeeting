
-- helpers
CREATE OR REPLACE FUNCTION public.is_deo(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT public.has_role(_user, 'deo'::app_role) $$;

CREATE OR REPLACE FUNCTION public.is_admin_or_deo(_user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public
AS $$ SELECT public.has_role(_user, 'admin'::app_role) OR public.has_role(_user, 'deo'::app_role) $$;

-- new sign-ups: pending, no auto role
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='public' AS $fn$
DECLARE _name text; _handle text;
BEGIN
  _name := coalesce(NEW.raw_user_meta_data->>'display_name',
                    NEW.raw_user_meta_data->>'full_name',
                    NEW.raw_user_meta_data->>'name',
                    split_part(NEW.email, '@', 1));
  _handle := public.generate_unique_handle(coalesce(NEW.raw_user_meta_data->>'handle', _name, 'user'));
  INSERT INTO public.profiles (id, handle, display_name, avatar_url, status)
  VALUES (NEW.id, _handle, coalesce(_name, _handle), NEW.raw_user_meta_data->>'avatar_url', 'pending'::account_status)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $fn$;

-- broaden write policies for DEO
DROP POLICY IF EXISTS "sections_write" ON public.sections;
CREATE POLICY "sections_write" ON public.sections FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_deo(auth.uid()) OR public.is_hod_of(auth.uid(), department_id))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_deo(auth.uid()) OR public.is_hod_of(auth.uid(), department_id));

DROP POLICY IF EXISTS "departments_admin_write" ON public.departments;
CREATE POLICY "departments_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_deo(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_deo(auth.uid()));

DROP POLICY IF EXISTS "student_sections_write" ON public.student_sections;
CREATE POLICY "student_sections_write" ON public.student_sections FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = student_sections.section_id AND public.is_hod_of(auth.uid(), s.department_id))
         OR public.faculty_of_section(auth.uid(), section_id))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = student_sections.section_id AND public.is_hod_of(auth.uid(), s.department_id))
         OR public.faculty_of_section(auth.uid(), section_id));

DROP POLICY IF EXISTS "faculty_sections_write" ON public.faculty_sections;
CREATE POLICY "faculty_sections_write" ON public.faculty_sections FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = faculty_sections.section_id AND public.is_hod_of(auth.uid(), s.department_id)))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = faculty_sections.section_id AND public.is_hod_of(auth.uid(), s.department_id)));

-- allow DEO to view abuse incidents (existing admin-only)
DROP POLICY IF EXISTS "abuse_admin_select" ON public.abuse_incidents;
CREATE POLICY "abuse_admin_select" ON public.abuse_incidents FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id AND m.host_id = auth.uid()));

-- daily slot count
ALTER TABLE public.sections ADD COLUMN IF NOT EXISTS slot_count int NOT NULL DEFAULT 7;

-- attendance
CREATE TABLE IF NOT EXISTS public.attendance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date date NOT NULL,
  slot int NOT NULL DEFAULT 1,
  status text NOT NULL CHECK (status IN ('present','absent','late')),
  notes text,
  marked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(section_id, student_id, date, slot)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT ALL ON public.attendance TO service_role;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "attendance_select" ON public.attendance FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = attendance.section_id AND public.is_hod_of(auth.uid(), s.department_id))
         OR public.faculty_of_section(auth.uid(), section_id)
         OR student_id = auth.uid());
CREATE POLICY "attendance_write" ON public.attendance FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = attendance.section_id AND public.is_hod_of(auth.uid(), s.department_id))
         OR public.faculty_of_section(auth.uid(), section_id))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = attendance.section_id AND public.is_hod_of(auth.uid(), s.department_id))
         OR public.faculty_of_section(auth.uid(), section_id));
CREATE TRIGGER trg_attendance_updated BEFORE UPDATE ON public.attendance FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- gradebook
CREATE TABLE IF NOT EXISTS public.gradebook_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL,
  exam_type text NOT NULL,
  term text,
  marks numeric NOT NULL,
  max_marks numeric NOT NULL DEFAULT 100,
  notes text,
  entered_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.gradebook_entries TO authenticated;
GRANT ALL ON public.gradebook_entries TO service_role;
ALTER TABLE public.gradebook_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "gradebook_select" ON public.gradebook_entries FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = gradebook_entries.section_id AND public.is_hod_of(auth.uid(), s.department_id))
         OR public.faculty_of_section(auth.uid(), section_id)
         OR student_id = auth.uid());
CREATE POLICY "gradebook_write" ON public.gradebook_entries FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = gradebook_entries.section_id AND public.is_hod_of(auth.uid(), s.department_id))
         OR public.faculty_of_section(auth.uid(), section_id))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_deo(auth.uid())
         OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = gradebook_entries.section_id AND public.is_hod_of(auth.uid(), s.department_id))
         OR public.faculty_of_section(auth.uid(), section_id));
CREATE TRIGGER trg_gradebook_updated BEFORE UPDATE ON public.gradebook_entries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gradebook_entries;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.student_sections;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_roles;
ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
