
-- 1) Recreate app_role enum (dropped earlier) with the 4-tier hierarchy
CREATE TYPE public.app_role AS ENUM ('admin', 'hod', 'faculty', 'student');
CREATE TYPE public.account_status AS ENUM ('active', 'suspended');
CREATE TYPE public.meeting_scope AS ENUM ('university', 'department', 'section', 'adhoc');
CREATE TYPE public.meeting_status AS ENUM ('scheduled', 'live', 'ended');

-- 2) Restore role column on user_roles
ALTER TABLE public.user_roles ADD COLUMN role public.app_role;
-- Seed everyone as student, then upgrade varaprasadsetty to admin
UPDATE public.user_roles SET role = 'student' WHERE role IS NULL;
-- Deduplicate before adding NOT NULL/UNIQUE
DELETE FROM public.user_roles a USING public.user_roles b
  WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.role = b.role;
ALTER TABLE public.user_roles ALTER COLUMN role SET NOT NULL;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_role_unique UNIQUE (user_id, role);

-- Promote varaprasad (from user request)
INSERT INTO public.user_roles (user_id, role)
VALUES ('328791c7-2c15-4722-a83e-062dca9422e1', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
-- Remove the extra 'student' row for varaprasad
DELETE FROM public.user_roles WHERE user_id='328791c7-2c15-4722-a83e-062dca9422e1' AND role='student';

-- 3) Restore has_role function
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;

CREATE OR REPLACE FUNCTION public.primary_role(_user uuid)
RETURNS public.app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user
  ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'hod' THEN 2 WHEN 'faculty' THEN 3 WHEN 'student' THEN 4 END
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.primary_role(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.primary_role(uuid) TO authenticated;

-- 4) DEPARTMENTS
CREATE TABLE public.departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  code text NOT NULL UNIQUE,
  hod_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_departments_updated BEFORE UPDATE ON public.departments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) Extend profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status public.account_status NOT NULL DEFAULT 'active';

-- 6) SECTIONS
CREATE TABLE public.sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sections TO authenticated;
GRANT ALL ON public.sections TO service_role;
ALTER TABLE public.sections ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER trg_sections_updated BEFORE UPDATE ON public.sections FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 7) FACULTY <-> SECTIONS
CREATE TABLE public.faculty_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faculty_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (faculty_id, section_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.faculty_sections TO authenticated;
GRANT ALL ON public.faculty_sections TO service_role;
ALTER TABLE public.faculty_sections ENABLE ROW LEVEL SECURITY;

-- 8) STUDENT <-> SECTIONS
CREATE TABLE public.student_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, section_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_sections TO authenticated;
GRANT ALL ON public.student_sections TO service_role;
ALTER TABLE public.student_sections ENABLE ROW LEVEL SECURITY;

-- 9) Hierarchy helpers
CREATE OR REPLACE FUNCTION public.is_hod_of(_user uuid, _dept uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.departments WHERE id = _dept AND hod_id = _user);
$$;
REVOKE ALL ON FUNCTION public.is_hod_of(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_hod_of(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.faculty_of_section(_user uuid, _section uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.faculty_sections WHERE faculty_id = _user AND section_id = _section);
$$;
REVOKE ALL ON FUNCTION public.faculty_of_section(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.faculty_of_section(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.student_of_section(_user uuid, _section uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.student_sections WHERE student_id = _user AND section_id = _section);
$$;
REVOKE ALL ON FUNCTION public.student_of_section(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_of_section(uuid, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.in_department(_user uuid, _dept uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.departments WHERE id = _dept AND hod_id = _user)
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = _user AND department_id = _dept)
    OR EXISTS (SELECT 1 FROM public.faculty_sections fs JOIN public.sections s ON s.id = fs.section_id WHERE fs.faculty_id = _user AND s.department_id = _dept)
    OR EXISTS (SELECT 1 FROM public.student_sections ss JOIN public.sections s ON s.id = ss.section_id WHERE ss.student_id = _user AND s.department_id = _dept);
$$;
REVOKE ALL ON FUNCTION public.in_department(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.in_department(uuid, uuid) TO authenticated;

-- 10) Departments/Sections policies
CREATE POLICY "departments_select" ON public.departments FOR SELECT TO authenticated USING (true);
CREATE POLICY "departments_admin_write" ON public.departments FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));
CREATE POLICY "departments_hod_update" ON public.departments FOR UPDATE TO authenticated
  USING (public.is_hod_of(auth.uid(), id)) WITH CHECK (public.is_hod_of(auth.uid(), id));

CREATE POLICY "sections_select" ON public.sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "sections_write" ON public.sections FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR public.is_hod_of(auth.uid(), department_id))
  WITH CHECK (public.is_admin(auth.uid()) OR public.is_hod_of(auth.uid(), department_id));

CREATE POLICY "faculty_sections_select" ON public.faculty_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "faculty_sections_write" ON public.faculty_sections FOR ALL TO authenticated
  USING (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND public.is_hod_of(auth.uid(), s.department_id)))
  WITH CHECK (public.is_admin(auth.uid()) OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND public.is_hod_of(auth.uid(), s.department_id)));

CREATE POLICY "student_sections_select" ON public.student_sections FOR SELECT TO authenticated USING (true);
CREATE POLICY "student_sections_write" ON public.student_sections FOR ALL TO authenticated
  USING (public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND public.is_hod_of(auth.uid(), s.department_id))
    OR public.faculty_of_section(auth.uid(), section_id))
  WITH CHECK (public.is_admin(auth.uid())
    OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND public.is_hod_of(auth.uid(), s.department_id))
    OR public.faculty_of_section(auth.uid(), section_id));

-- 11) Extend meetings for hierarchy
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS scope public.meeting_scope NOT NULL DEFAULT 'adhoc';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS section_id uuid REFERENCES public.sections(id) ON DELETE SET NULL;
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS status public.meeting_status NOT NULL DEFAULT 'scheduled';
ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS is_locked boolean NOT NULL DEFAULT false;

-- 12) Update can_access_meeting to include hierarchy
CREATE OR REPLACE FUNCTION public.can_access_meeting(_meeting uuid, _user uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    public.is_admin(_user)
    OR EXISTS (SELECT 1 FROM public.meetings WHERE id = _meeting AND host_id = _user)
    OR EXISTS (SELECT 1 FROM public.meeting_invitations WHERE meeting_id = _meeting AND invitee_id = _user)
    OR EXISTS (SELECT 1 FROM public.meeting_participants WHERE meeting_id = _meeting AND user_id = _user)
    OR EXISTS (
      SELECT 1 FROM public.meetings m WHERE m.id = _meeting AND (
        m.scope = 'university'
        OR (m.scope = 'department' AND m.department_id IS NOT NULL AND public.in_department(_user, m.department_id))
        OR (m.scope = 'section' AND m.section_id IS NOT NULL AND (public.faculty_of_section(_user, m.section_id) OR public.student_of_section(_user, m.section_id)))
      )
    );
$$;

-- 13) Meeting INSERT policy: restrict to admin/hod/faculty
DROP POLICY IF EXISTS "Authenticated create meetings" ON public.meetings;
CREATE POLICY "Privileged users create meetings" ON public.meetings FOR INSERT TO authenticated
  WITH CHECK (host_id = auth.uid() AND (
    public.is_admin(auth.uid())
    OR public.has_role(auth.uid(), 'hod')
    OR public.has_role(auth.uid(), 'faculty')
  ));

-- 14) Update handle_new_user to default new signups to 'student'
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _name text; _handle text;
BEGIN
  _name := coalesce(NEW.raw_user_meta_data->>'display_name',
                    NEW.raw_user_meta_data->>'full_name',
                    NEW.raw_user_meta_data->>'name',
                    split_part(NEW.email, '@', 1));
  _handle := public.generate_unique_handle(coalesce(NEW.raw_user_meta_data->>'handle', _name, 'user'));
  INSERT INTO public.profiles (id, handle, display_name, avatar_url)
  VALUES (NEW.id, _handle, coalesce(_name, _handle), NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END; $$;
