-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================
--  PROJECTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.projects (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title            TEXT        NOT NULL DEFAULT '',
    description      TEXT        DEFAULT '',
    sort_order       INTEGER     DEFAULT 0,
    epics            JSONB       DEFAULT '[]'::jsonb,
    resources        JSONB       DEFAULT '{"notes":""}'::jsonb,
    no_epic_collapsed BOOLEAN    DEFAULT false,
    created_at       TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "projects: own rows only"
    ON public.projects FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS projects_user_sort_idx
    ON public.projects (user_id, sort_order);

-- ============================================================
--  TODOS  (project_id IS NULL → inbox)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.todos (
    id             UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id        UUID     NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    project_id     UUID     REFERENCES public.projects(id) ON DELETE CASCADE,
    title          TEXT     NOT NULL DEFAULT '',
    description    TEXT     DEFAULT '',
    due_date       TEXT     DEFAULT '',
    priority       TEXT     DEFAULT 'Low',
    notes          TEXT     DEFAULT '',
    checklist      JSONB    DEFAULT '[]'::jsonb,
    reference_link TEXT     DEFAULT '',
    status         TEXT     DEFAULT 'Not Started',
    epic_id        UUID,
    sort_order     INTEGER  DEFAULT 0,
    created_at     BIGINT   DEFAULT 0,
    updated_at     BIGINT   DEFAULT 0
);

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "todos: own rows only"
    ON public.todos FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS todos_project_sort_idx
    ON public.todos (user_id, project_id, sort_order);

CREATE INDEX IF NOT EXISTS todos_inbox_idx
    ON public.todos (user_id, sort_order)
    WHERE project_id IS NULL;

-- ============================================================
--  USER COLUMNS  (global kanban column config — one row per user)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_columns (
    user_id    UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    data       JSONB       NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.user_columns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_columns: own row only"
    ON public.user_columns FOR ALL
    USING  (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
