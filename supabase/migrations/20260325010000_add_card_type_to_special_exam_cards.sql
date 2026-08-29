-- Add card_type column to special_exam_cards to differentiate between exam cards and announcement cards
ALTER TABLE public.special_exam_cards
  ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'exam' CHECK (card_type IN ('exam', 'announcement'));
