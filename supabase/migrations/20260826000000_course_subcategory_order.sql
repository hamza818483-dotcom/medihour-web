-- Per-sub-category course ordering for the landing page.
-- Global "priority" stays as a fallback/default order, but this new column
-- lets a course have a DIFFERENT position depending on which sub_category
-- tab it's shown under (e.g. can be #1 in "Full Course" but #5 in "GK-English").
--
-- Shape: { "<sub_category name>": <integer order, ascending = shown first> }
-- A sub_category not present in this map falls back to the global priority.
ALTER TABLE public.courses
  ADD COLUMN IF NOT EXISTS sub_category_order jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.courses.sub_category_order IS
  'Per-sub_category display order override, e.g. {"Full Course": 1, "GK-English": 3}. Falls back to courses.priority when a sub_category key is absent.';
