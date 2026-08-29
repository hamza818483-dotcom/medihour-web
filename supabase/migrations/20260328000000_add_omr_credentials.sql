-- Add OMR credential columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS omr_roll_no TEXT,
  ADD COLUMN IF NOT EXISTS omr_reg_no TEXT;

-- Unique constraints
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_omr_roll_no_unique UNIQUE (omr_roll_no);
ALTER TABLE public.profiles 
  ADD CONSTRAINT profiles_omr_reg_no_unique UNIQUE (omr_reg_no);

-- RPC function to generate unique 6-digit OMR credentials
CREATE OR REPLACE FUNCTION public.generate_omr_credentials()
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_roll text;
  v_reg text;
  v_existing_roll text;
  v_existing_reg text;
BEGIN
  -- Check if user is authenticated
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  -- Check if already generated
  SELECT omr_roll_no, omr_reg_no 
  INTO v_existing_roll, v_existing_reg 
  FROM profiles WHERE id = v_user_id;

  IF v_existing_roll IS NOT NULL AND v_existing_reg IS NOT NULL THEN
    RETURN json_build_object(
      'omr_roll_no', v_existing_roll,
      'omr_reg_no', v_existing_reg,
      'already_generated', true
    );
  END IF;

  -- Generate unique 6-digit roll number
  LOOP
    v_roll := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE omr_roll_no = v_roll);
  END LOOP;

  -- Generate unique 6-digit reg number  
  LOOP
    v_reg := LPAD(FLOOR(RANDOM() * 1000000)::TEXT, 6, '0');
    EXIT WHEN NOT EXISTS (SELECT 1 FROM profiles WHERE omr_reg_no = v_reg);
  END LOOP;

  -- Save
  UPDATE profiles 
  SET omr_roll_no = v_roll, omr_reg_no = v_reg 
  WHERE id = v_user_id;

  RETURN json_build_object(
    'omr_roll_no', v_roll,
    'omr_reg_no', v_reg,
    'already_generated', false
  );
END;
$$;
