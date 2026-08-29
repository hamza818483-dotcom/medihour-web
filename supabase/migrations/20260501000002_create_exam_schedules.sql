-- Create exam_schedules table
CREATE TABLE IF NOT EXISTS public.exam_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_name TEXT NOT NULL,
    paper_name TEXT, -- e.g., '1st Paper', '2nd Paper'
    exam_date TIMESTAMP WITH TIME ZONE NOT NULL,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Turn on RLS
ALTER TABLE public.exam_schedules ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access on exam_schedules" 
    ON public.exam_schedules FOR SELECT USING (true);

-- Allow admin write access
CREATE POLICY "Allow admin all access on exam_schedules" 
    ON public.exam_schedules FOR ALL 
    USING (
      EXISTS (
        SELECT 1 FROM public.user_roles 
        WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')
      )
    );

-- Notify Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';
