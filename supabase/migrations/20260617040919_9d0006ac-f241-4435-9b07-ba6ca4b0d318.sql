GRANT EXECUTE ON FUNCTION public.can_access_meeting(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_meeting_host(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.generate_unique_handle(text) TO authenticated, anon;