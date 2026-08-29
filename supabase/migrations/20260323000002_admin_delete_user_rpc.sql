-- Create a secure function to deep-delete a user
-- This function must be run by an authenticated user with the 'admin' role
-- It deletes the user from auth.users, which cascades to public.profiles and other tables
CREATE OR REPLACE FUNCTION public.admin_delete_user(
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER -- Runs with superuser privileges to access auth schema
SET search_path = public
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
    RAISE EXCEPTION 'Only administrators can delete users.';
  END IF;

  -- 2. Delete the user from auth.users
  -- This will cascade to public.profiles, enrollments, etc. due to ON DELETE CASCADE
  DELETE FROM auth.users
  WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'message', 'User deleted successfully from everywhere.');
END;
$$;

-- Grant access to authenticated users (logic check inside function handles admin-only)
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID) TO authenticated;
