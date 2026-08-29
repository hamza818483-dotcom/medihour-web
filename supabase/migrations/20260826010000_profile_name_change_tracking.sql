-- Lets a student change their full_name exactly ONCE from their own profile
-- page. full_name was previously locked (disabled input, excluded from the
-- update payload) — this adds a tracking flag so it can be unlocked for a
-- single edit and then re-locked automatically.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name_changed_once boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.profiles.name_changed_once IS
  'Set to true the first time a student edits their own full_name from the profile page. Once true, the name field is locked again (enforced client-side; RLS still allows admin to edit anytime).';
