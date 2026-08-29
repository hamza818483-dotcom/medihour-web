-- Add admin RPC to confirm student email manually
CREATE OR REPLACE FUNCTION public.admin_confirm_user_email(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  UPDATE auth.users
  SET email_confirmed_at = NOW()
  WHERE id = p_user_id;
END;
$$;
