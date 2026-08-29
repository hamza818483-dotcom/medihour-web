-- 1. Add tracking for 1-time email change
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS has_changed_email BOOLEAN DEFAULT FALSE;

-- 2. Create the auth user creation trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    registration_id,
    full_name,
    father_name,
    mother_name,
    phone,
    hsc_batch,
    college_name,
    ssc_gpa,
    hsc_gpa,
    is_second_timer,
    extra_time_multiplier
  )
  VALUES (
    new.id,
    -- User's phone acts as their registration ID currently
    COALESCE(new.raw_user_meta_data->>'phone', new.phone),
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'father_name',
    new.raw_user_meta_data->>'mother_name',
    COALESCE(new.raw_user_meta_data->>'phone', new.phone),
    new.raw_user_meta_data->>'hsc_batch',
    new.raw_user_meta_data->>'college_name',
    COALESCE((new.raw_user_meta_data->>'ssc_gpa')::numeric, 0),
    COALESCE((new.raw_user_meta_data->>'hsc_gpa')::numeric, 0),
    COALESCE((new.raw_user_meta_data->>'is_second_timer')::boolean, false),
    1
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 3. Create RPC for admins to reset user passwords
CREATE OR REPLACE FUNCTION public.admin_reset_password(p_user_id UUID, p_new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, auth
AS $$
BEGIN
  -- Verify caller is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  -- Ensure password has sufficient length
  IF length(p_new_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters.';
  END IF;

  UPDATE auth.users
  SET encrypted_password = extensions.crypt(p_new_password, extensions.gen_salt('bf'))
  WHERE id = p_user_id;

  RETURN TRUE;
END;
$$;
