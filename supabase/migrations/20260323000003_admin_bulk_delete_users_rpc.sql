-- Create a secure function to bulk-delete users
-- This function must be run by an authenticated user with the 'admin' role
-- It deletes multiple users from auth.users, which cascades to public.profiles and other tables
CREATE OR REPLACE FUNCTION public.admin_bulk_delete_users(
  p_user_ids UUID[]
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
    RAISE EXCEPTION 'Only administrators can bulk-delete users.';
  END IF;

  -- 2. Delete the users from auth.users
  -- This will cascade to public.profiles, enrollments, etc. due to ON DELETE CASCADE
  DELETE FROM auth.users
  WHERE id = ANY(p_user_ids);

  RETURN jsonb_build_object(
      'success', true, 
      'message', array_length(p_user_ids, 1) || ' users deleted successfully from everywhere.'
  );
END;
$$;

-- Grant access to authenticated users (logic check inside function handles admin-only)
GRANT EXECUTE ON FUNCTION public.admin_bulk_delete_users(UUID[]) TO authenticated;
