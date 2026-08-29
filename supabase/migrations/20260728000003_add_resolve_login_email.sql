-- Public RPC (rate-limited by Turnstile captcha on the login form) to resolve
-- a phone number or registration_id to the account's real auth email.
-- This is required because registration now creates auth users with the
-- student's real email, not a synthetic one, so phone-based login must look
-- up the actual email before calling signInWithPassword.
CREATE OR REPLACE FUNCTION public.resolve_login_email(p_identifier text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id uuid;
  v_email text;
BEGIN
  SELECT id INTO v_user_id
  FROM public.profiles
  WHERE phone = p_identifier OR registration_id = p_identifier
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  RETURN v_email;
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_login_email(text) TO anon, authenticated;
