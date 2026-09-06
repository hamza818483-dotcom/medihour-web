-- Fully remove Father's Name / Mother's Name from profiles (admin view + DB column).
-- Also drop the now-unused profiles.is_second_timer column since the
-- Second Timer flag moved to a per-attempt field (exam_attempts.is_second_timer_attempt).

-- Update handle_new_user first (it still references these columns) so
-- signup keeps working once the columns are dropped below.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    registration_id,
    full_name,
    phone,
    hsc_batch,
    college_name,
    ssc_gpa,
    hsc_gpa,
    gender,
    extra_time_multiplier,
    utm_source,
    utm_medium,
    utm_campaign,
    utm_content,
    utm_term
  )
  VALUES (
    new.id,
    COALESCE(new.raw_user_meta_data->>'phone', new.phone, new.id::text),
    new.raw_user_meta_data->>'full_name',
    COALESCE(new.raw_user_meta_data->>'phone', new.phone),
    new.raw_user_meta_data->>'hsc_batch',
    new.raw_user_meta_data->>'college_name',
    COALESCE(NULLIF(new.raw_user_meta_data->>'ssc_gpa', '')::numeric, 0),
    COALESCE(NULLIF(new.raw_user_meta_data->>'hsc_gpa', '')::numeric, 0),
    new.raw_user_meta_data->>'gender',
    1,
    new.raw_user_meta_data->>'utm_source',
    new.raw_user_meta_data->>'utm_medium',
    new.raw_user_meta_data->>'utm_campaign',
    new.raw_user_meta_data->>'utm_content',
    new.raw_user_meta_data->>'utm_term'
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    phone = EXCLUDED.phone,
    hsc_batch = EXCLUDED.hsc_batch,
    college_name = EXCLUDED.college_name,
    ssc_gpa = EXCLUDED.ssc_gpa,
    hsc_gpa = EXCLUDED.hsc_gpa,
    gender = EXCLUDED.gender,
    utm_source = COALESCE(public.profiles.utm_source, EXCLUDED.utm_source),
    utm_medium = COALESCE(public.profiles.utm_medium, EXCLUDED.utm_medium),
    utm_campaign = COALESCE(public.profiles.utm_campaign, EXCLUDED.utm_campaign),
    utm_content = COALESCE(public.profiles.utm_content, EXCLUDED.utm_content),
    utm_term = COALESCE(public.profiles.utm_term, EXCLUDED.utm_term);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TABLE public.profiles DROP COLUMN IF EXISTS father_name;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS mother_name;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS is_second_timer;

NOTIFY pgrst, 'reload schema';
