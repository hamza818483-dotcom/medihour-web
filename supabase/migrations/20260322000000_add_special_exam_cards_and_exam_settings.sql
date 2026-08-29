-- Create special_exam_cards table
CREATE TABLE IF NOT EXISTS public.special_exam_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    details TEXT,
    instructions TEXT,
    image_url TEXT,
    action_link TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on RLS
ALTER TABLE public.special_exam_cards ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on special_exam_cards" 
    ON public.special_exam_cards FOR SELECT USING (true);

-- Allow admin write access (using the same policy style as heroes/mentors)
CREATE POLICY "Allow admin all access on special_exam_cards" 
    ON public.special_exam_cards FOR ALL 
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')
      )
    );

-- Add disable_second_timer_deduction to exams table
ALTER TABLE public.exams
    ADD COLUMN IF NOT EXISTS disable_second_timer_deduction BOOLEAN DEFAULT false;

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
