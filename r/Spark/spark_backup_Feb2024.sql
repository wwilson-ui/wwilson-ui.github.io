-- ================================================
-- NEW FEATURES: Flagging & Teacher Settings
-- ================================================

-- 1. Create flags table for reporting posts/comments
CREATE TABLE IF NOT EXISTS public.flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  reviewed BOOLEAN DEFAULT false,
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  CONSTRAINT flag_target CHECK ((post_id IS NOT NULL AND comment_id IS NULL) OR (post_id IS NULL AND comment_id IS NOT NULL))
);

-- 2. Create teacher settings table
CREATE TABLE IF NOT EXISTS public.teacher_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL
);

-- Insert default settings
INSERT INTO public.teacher_settings (setting_key, setting_value)
VALUES ('show_real_names', false)
ON CONFLICT (setting_key) DO NOTHING;

-- 3. Enable RLS on flags
ALTER TABLE public.flags ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies for flags
DROP POLICY IF EXISTS "Users can view own flags" ON public.flags;
DROP POLICY IF EXISTS "Teachers can view all flags" ON public.flags;
DROP POLICY IF EXISTS "Users can create flags" ON public.flags;
DROP POLICY IF EXISTS "Teachers can update flags" ON public.flags;

CREATE POLICY "Users can view own flags" ON public.flags 
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Teachers can view all flags" ON public.flags 
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );

CREATE POLICY "Users can create flags" ON public.flags 
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Teachers can update flags" ON public.flags 
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );

-- 5. Enable RLS on teacher_settings
ALTER TABLE public.teacher_settings ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies for teacher_settings
DROP POLICY IF EXISTS "Everyone can view settings" ON public.teacher_settings;
DROP POLICY IF EXISTS "Teachers can update settings" ON public.teacher_settings;

CREATE POLICY "Everyone can view settings" ON public.teacher_settings 
  FOR SELECT USING (true);

CREATE POLICY "Teachers can update settings" ON public.teacher_settings 
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'teacher')
  );

-- 7. Create indexes
CREATE INDEX IF NOT EXISTS idx_flags_post ON public.flags(post_id);
CREATE INDEX IF NOT EXISTS idx_flags_comment ON public.flags(comment_id);
CREATE INDEX IF NOT EXISTS idx_flags_reviewed ON public.flags(reviewed);

SELECT 'New features added successfully!' as status;
