-- Admin RPC to find profile ids whose auth email matches a search term
CREATE OR REPLACE FUNCTION public.admin_search_users_by_email(p_search text)
RETURNS TABLE(id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;
  RETURN QUERY
  SELECT u.id FROM auth.users u
  WHERE u.email ILIKE '%' || p_search || '%';
END;
$$;
