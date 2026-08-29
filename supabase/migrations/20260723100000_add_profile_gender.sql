-- Adds a gender field to profiles, collected at registration, so a
-- gender-appropriate avatar can be generated on the leaderboard (and
-- elsewhere) when the user hasn't uploaded a custom avatar_url.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS gender text
    CHECK (gender IN ('male', 'female', 'other'));

COMMENT ON COLUMN public.profiles.gender IS
  'Collected at registration; used to pick a gender-appropriate default avatar when no custom avatar_url is set.';
