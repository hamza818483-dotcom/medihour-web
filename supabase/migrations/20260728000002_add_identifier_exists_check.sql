-- Public RPC (rate-limited by Turnstile captcha on the login form) to check
-- whether a login identifier (registration_id, phone, or email) exists.
-- Used only to give a clearer error message ("account not found" vs
-- "wrong password") — it never reveals which field matched or any other data.
CREATE OR REPLACE FUNCTION public.check_identifier_exists(p_identifier text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.registration_id = p_identifier
       OR p.phone = p_identifier
  ) OR EXISTS (
    SELECT 1 FROM auth.users u
    WHERE u.email = p_identifier
       OR u.email = p_identifier || '@beshijoss.com'
  ) INTO v_exists;

  RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_identifier_exists(text) TO anon, authenticated;
