-- Create a secure function to force-update a user's email
-- This function must be run by an authenticated user with the 'admin' role
CREATE OR REPLACE FUNCTION public.admin_update_user_email(
  p_user_id UUID,
  p_new_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with superuser privileges to access auth schema
SET search_path = public, extensions, auth
AS $$
DECLARE
  v_caller_id UUID;
  v_is_admin BOOLEAN;
BEGIN
  -- 1. Security Check: Only allow admins to call this
  v_caller_id := auth.uid();
  
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = v_caller_id AND role = 'admin'
  ) INTO v_is_admin;

  IF NOT v_is_admin THEN
    RAISE EXCEPTION 'Only administrators can force-update user emails.';
  END IF;

  -- 2. Validate the new email isn't already taken
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_new_email) THEN
    RAISE EXCEPTION 'This email is already registered to another account.';
  END IF;

  -- 3. Update the auth.users table directly
  UPDATE auth.users
  SET 
    email = p_new_email,
    email_confirmed_at = now(), -- Mark as verified immediately
    updated_at = now(),
    email_change = '', -- Clear any pending changes with empty string (avoid NULL scan error)
    email_change_sent_at = NULL
  WHERE id = p_user_id;

  -- 4. Mark the one-time flag in the profiles table as used
  UPDATE public.profiles
  SET has_changed_email = true
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'Email updated successfully to ' || p_new_email);
END;
$$;

-- Grant access to authenticated users (logic check inside function handles admin-only)
GRANT EXECUTE ON FUNCTION public.admin_update_user_email(UUID, TEXT) TO authenticated;
