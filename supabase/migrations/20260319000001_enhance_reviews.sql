-- Alter reviews table to add category and images
ALTER TABLE public.reviews 
ADD COLUMN IF NOT EXISTS category text DEFAULT 'General',
ADD COLUMN IF NOT EXISTS images text[] DEFAULT '{}';

-- Create class_views table for attendance tracking
CREATE TABLE IF NOT EXISTS public.class_views (
    id uuid DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT class_views_profile_id_class_id_key UNIQUE (profile_id, class_id)
);

-- RLS for class_views
ALTER TABLE public.class_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own class views" 
ON public.class_views FOR SELECT 
USING (auth.uid() = profile_id);

CREATE POLICY "Users can insert their own class views" 
ON public.class_views FOR INSERT 
WITH CHECK (auth.uid() = profile_id);

CREATE POLICY "Admins can view all class views" 
ON public.class_views FOR SELECT 
USING (EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')));
