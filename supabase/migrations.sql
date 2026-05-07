-- Run this in Supabase SQL Editor after schema.sql
-- ============================================================
--  USER PREFERENCES  (one row per user — theme, avatar, name)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_preferences (
    user_id      UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    theme        TEXT        NOT NULL DEFAULT 'light',
    avatar_color TEXT,
    display_name TEXT,
    updated_at   TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_preferences: own row only"
    ON public.user_preferences FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
