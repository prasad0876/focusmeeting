CREATE TABLE public.security_audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  internal_id text NOT NULL,
  scanner_name text,
  severity text NOT NULL DEFAULT 'medium',
  category text,
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'fixed',
  remediation text,
  files_changed text[] NOT NULL DEFAULT '{}',
  migration_notes text,
  recorded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX security_audit_log_internal_id_idx ON public.security_audit_log (internal_id);
CREATE INDEX security_audit_log_created_at_idx ON public.security_audit_log (created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.security_audit_log TO authenticated;
GRANT ALL ON public.security_audit_log TO service_role;

ALTER TABLE public.security_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "security_audit_log_admin_read" ON public.security_audit_log
  FOR SELECT TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_deo(auth.uid()));

CREATE POLICY "security_audit_log_admin_insert" ON public.security_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_deo(auth.uid()));

CREATE POLICY "security_audit_log_admin_update" ON public.security_audit_log
  FOR UPDATE TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_deo(auth.uid()))
  WITH CHECK (private.is_admin(auth.uid()) OR private.is_deo(auth.uid()));

CREATE POLICY "security_audit_log_admin_delete" ON public.security_audit_log
  FOR DELETE TO authenticated
  USING (private.is_admin(auth.uid()) OR private.is_deo(auth.uid()));

CREATE TRIGGER security_audit_log_set_updated_at
  BEFORE UPDATE ON public.security_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();