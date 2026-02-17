-- ==========================================
-- SPARK MASTER RECONSTRUCTION SCRIPT
-- Contains: Tables, RLS Policies, Triggers, and Constraints
-- ==========================================

-- 1. CLEANUP (Optional: Only uncomment if you want a TOTAL wipe)
-- DROP TABLE IF EXISTS public.votes;
-- DROP TABLE IF EXISTS public.comments;
-- DROP TABLE IF EXISTS public.posts;
-- DROP TABLE IF EXISTS public.subreddits;
-- DROP TABLE IF EXISTS public.profiles;

-- 2. TABLE STRUCTURES
-- ==========================================

-- Profiles (The "Null Fix" included: username and display_name are nullable)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users NOT NULL PRIMARY KEY,
  email TEXT NOT NULL,
  username TEXT, 
  display_name TEXT, 
  role TEXT DEFAULT 'student',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Subreddits
CREATE TABLE IF NOT EXISTS public.subreddits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Posts
CREATE TABLE IF NOT EXISTS public.posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT,
  url TEXT,
  image_url TEXT,
  subreddit_id UUID REFERENCES public.subreddits(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  up_votes INTEGER DEFAULT 0,
  down_votes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Comments
CREATE TABLE IF NOT EXISTS public.comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  up_votes INTEGER DEFAULT 0,
  down_votes INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Votes (The "Unique Constraint" included)
CREATE TABLE IF NOT EXISTS public.votes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  post_id UUID REFERENCES public.posts(id) ON DELETE CASCADE,
  comment_id UUID REFERENCES public.comments(id) ON DELETE CASCADE,
  vote_type INTEGER NOT NULL, -- 1 for up, -1 for down
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
  CONSTRAINT one_vote_per_post_unique UNIQUE (user_id, post_id),
  CONSTRAINT one_vote_per_comment_unique UNIQUE (user_id, comment_id),
  CONSTRAINT vote_target_check CHECK (
    (post_id IS NOT NULL AND comment_id IS NULL) OR 
    (post_id IS NULL AND comment_id IS NOT NULL)
  )
);

-- 3. ENABLE ROW LEVEL SECURITY
-- ==========================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subreddits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;

-- 4. MASTER POLICIES (Clean Slate Reset)
-- ==========================================
DO $$ 
DECLARE pol record;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- Profiles
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Subreddits
CREATE POLICY "subs_select" ON public.subreddits FOR SELECT USING (true);
CREATE POLICY "subs_teacher_all" ON public.subreddits FOR ALL 
USING (auth.jwt() ->> 'email' = 'wwilson@mtps.us');

-- Posts
CREATE POLICY "posts_select" ON public.posts FOR SELECT USING (true);
CREATE POLICY "posts_insert_auth" ON public.posts FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "posts_delete_logic" ON public.posts FOR DELETE 
USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'wwilson@mtps.us');

-- Comments
CREATE POLICY "comments_select" ON public.comments FOR SELECT USING (true);
CREATE POLICY "comments_insert_auth" ON public.comments FOR INSERT WITH CHECK (auth.role() = 'authenticated');
CREATE POLICY "comments_delete_logic" ON public.comments FOR DELETE 
USING (auth.uid() = user_id OR auth.jwt() ->> 'email' = 'wwilson@mtps.us');

-- Votes (The "Voting Correction" included)
CREATE POLICY "votes_select" ON public.votes FOR SELECT USING (true);
CREATE POLICY "votes_manage_own" ON public.votes FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

-- 5. AUTOMATION (The "Auto-Profile" Trigger)
-- ==========================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username, display_name, role)
  VALUES (
    new.id, 
    new.email, 
    split_part(new.email, '@', 1),
    split_part(new.email, '@', 1),
    CASE WHEN new.email = 'wwilson@mtps.us' THEN 'teacher' ELSE 'student' END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
