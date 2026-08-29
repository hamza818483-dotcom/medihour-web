-- EMI Logs table for tracking individual partial payment transactions
CREATE TABLE IF NOT EXISTS public.emi_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  payment_request_id uuid REFERENCES public.payment_requests(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  course_id uuid REFERENCES public.courses(id) ON DELETE SET NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  admin_note text,
  recorded_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE public.emi_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin only emi_logs" ON public.emi_logs
  USING (public.is_admin());
