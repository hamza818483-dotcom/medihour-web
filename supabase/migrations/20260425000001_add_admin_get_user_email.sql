-- Add RPC to get user email (admin only)
CREATE OR REPLACE FUNCTION public.admin_get_user_email(p_user_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_email text;
BEGIN
  -- Check if caller is admin
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = p_user_id;

  RETURN v_email;
END;
$$;
