-- Add new fields to payment_requests table
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS amount_sent numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS due_amount numeric DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS due_date date DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS sender_last5 text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_link text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS contact_number text DEFAULT NULL;

-- Add column for tracking due payments (partial payments)
-- updated_at already exists but ensure it's present
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Add a note field for admin comments
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS admin_note text DEFAULT NULL;

-- Add amount_paid to track EMI payments (amount paid so far, less than total)
ALTER TABLE public.payment_requests
  ADD COLUMN IF NOT EXISTS amount_paid numeric DEFAULT NULL;

-- Add routine course_ids array for multi-course routine support
ALTER TABLE public.routines
  ADD COLUMN IF NOT EXISTS course_ids uuid[] DEFAULT '{}';
