-- Fix handle_new_user trigger to gracefully handle duplicate registration_ids.
-- Previously, if two students registered with the same phone number, the UNIQUE constraint
-- on registration_id would cause the trigger to crash with "Database error saving new user".
-- This fix uses ON CONFLICT to update the existing profile row instead of failing.

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
    COALESCE(new.raw_user_meta_data->>'phone', new.phone, new.id::text),
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
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    father_name = EXCLUDED.father_name,
    mother_name = EXCLUDED.mother_name,
    phone = EXCLUDED.phone,
    hsc_batch = EXCLUDED.hsc_batch,
    college_name = EXCLUDED.college_name,
    ssc_gpa = EXCLUDED.ssc_gpa,
    hsc_gpa = EXCLUDED.hsc_gpa,
    is_second_timer = EXCLUDED.is_second_timer;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
