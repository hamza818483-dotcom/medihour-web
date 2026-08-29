-- Clear any AI explanations that were accidentally cached as a failure/busy
-- message (from before the client-side fix that skips caching failures).
-- These would otherwise be stuck forever showing "AI busy" instead of a
-- real explanation, since the cache write is "only if currently null".

UPDATE public.exam_questions
SET ai_explanation = NULL,
    ai_explanation_generated_at = NULL
WHERE ai_explanation IS NOT NULL
  AND (
    ai_explanation LIKE '❌%'
    OR ai_explanation LIKE '⏱️%'
  );
