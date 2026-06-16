
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_access_meeting(uuid, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_meeting_host(uuid, uuid) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.generate_unique_handle(text) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM public, anon, authenticated;
