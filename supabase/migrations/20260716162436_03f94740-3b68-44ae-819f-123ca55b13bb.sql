
-- 1. Private schema for security helpers
CREATE SCHEMA IF NOT EXISTS private;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

-- Move policy-only SECURITY DEFINER helpers out of public
ALTER FUNCTION public.is_admin(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_deo(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_admin_or_deo(uuid) SET SCHEMA private;
ALTER FUNCTION public.is_hod_of(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.is_meeting_host(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.can_access_meeting(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.faculty_of_section(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.student_of_section(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.in_department(uuid, uuid) SET SCHEMA private;

-- 2. Keep has_role/primary_role callable via RPC but run as caller
ALTER FUNCTION public.has_role(uuid, public.app_role) SECURITY INVOKER;
ALTER FUNCTION public.primary_role(uuid) SECURITY INVOKER;

-- 3. Let each user read their own user_roles rows (needed for SECURITY INVOKER has_role/primary_role)
DROP POLICY IF EXISTS "Users view their own roles" ON public.user_roles;
CREATE POLICY "Users view their own roles"
ON public.user_roles
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- 4. Tighten profiles SELECT
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.profiles;
CREATE POLICY "Users view relevant profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  id = auth.uid()
  OR private.is_admin(auth.uid())
  OR private.is_deo(auth.uid())
  OR (department_id IS NOT NULL AND private.is_hod_of(auth.uid(), department_id))
  OR EXISTS (
    SELECT 1
    FROM public.meeting_participants mp1
    JOIN public.meeting_participants mp2 ON mp1.meeting_id = mp2.meeting_id
    WHERE mp1.user_id = auth.uid() AND mp2.user_id = profiles.id
  )
  OR EXISTS (
    SELECT 1 FROM public.meeting_invitations mi
    WHERE (mi.inviter_id = auth.uid() AND mi.invitee_id = profiles.id)
       OR (mi.invitee_id = auth.uid() AND mi.inviter_id = profiles.id)
  )
  OR EXISTS (
    SELECT 1 FROM public.meetings m
    WHERE m.host_id = profiles.id AND private.can_access_meeting(m.id, auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.student_sections ss
    WHERE ss.student_id = profiles.id AND (
      private.faculty_of_section(auth.uid(), ss.section_id)
      OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = ss.section_id AND private.is_hod_of(auth.uid(), s.department_id))
      OR EXISTS (SELECT 1 FROM public.student_sections mine WHERE mine.student_id = auth.uid() AND mine.section_id = ss.section_id)
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.faculty_sections fs
    WHERE fs.faculty_id = profiles.id AND (
      private.student_of_section(auth.uid(), fs.section_id)
      OR private.faculty_of_section(auth.uid(), fs.section_id)
      OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = fs.section_id AND private.is_hod_of(auth.uid(), s.department_id))
    )
  )
);

-- 5. Tighten departments / sections / faculty_sections / student_sections SELECT
DROP POLICY IF EXISTS departments_select ON public.departments;
CREATE POLICY departments_select
ON public.departments
FOR SELECT
TO authenticated
USING (
  private.is_admin(auth.uid())
  OR private.is_deo(auth.uid())
  OR private.in_department(auth.uid(), id)
);

DROP POLICY IF EXISTS sections_select ON public.sections;
CREATE POLICY sections_select
ON public.sections
FOR SELECT
TO authenticated
USING (
  private.is_admin(auth.uid())
  OR private.is_deo(auth.uid())
  OR private.is_hod_of(auth.uid(), department_id)
  OR private.faculty_of_section(auth.uid(), id)
  OR private.student_of_section(auth.uid(), id)
);

DROP POLICY IF EXISTS faculty_sections_select ON public.faculty_sections;
CREATE POLICY faculty_sections_select
ON public.faculty_sections
FOR SELECT
TO authenticated
USING (
  private.is_admin(auth.uid())
  OR private.is_deo(auth.uid())
  OR faculty_id = auth.uid()
  OR private.faculty_of_section(auth.uid(), section_id)
  OR private.student_of_section(auth.uid(), section_id)
  OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND private.is_hod_of(auth.uid(), s.department_id))
);

DROP POLICY IF EXISTS student_sections_select ON public.student_sections;
CREATE POLICY student_sections_select
ON public.student_sections
FOR SELECT
TO authenticated
USING (
  private.is_admin(auth.uid())
  OR private.is_deo(auth.uid())
  OR student_id = auth.uid()
  OR private.faculty_of_section(auth.uid(), section_id)
  OR private.student_of_section(auth.uid(), section_id)
  OR EXISTS (SELECT 1 FROM public.sections s WHERE s.id = section_id AND private.is_hod_of(auth.uid(), s.department_id))
);

-- 6. Realtime Authorization for private meeting channels rtc:<uuid> and share:<uuid>
DROP POLICY IF EXISTS "Meeting members read rtc/share channels" ON realtime.messages;
CREATE POLICY "Meeting members read rtc/share channels"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  (realtime.topic() LIKE 'rtc:%'
    AND private.can_access_meeting(substring(realtime.topic() FROM 5)::uuid, auth.uid()))
  OR (realtime.topic() LIKE 'share:%'
    AND private.can_access_meeting(substring(realtime.topic() FROM 7)::uuid, auth.uid()))
);

DROP POLICY IF EXISTS "Meeting members publish rtc/share channels" ON realtime.messages;
CREATE POLICY "Meeting members publish rtc/share channels"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  (realtime.topic() LIKE 'rtc:%'
    AND private.can_access_meeting(substring(realtime.topic() FROM 5)::uuid, auth.uid()))
  OR (realtime.topic() LIKE 'share:%'
    AND private.can_access_meeting(substring(realtime.topic() FROM 7)::uuid, auth.uid()))
);
