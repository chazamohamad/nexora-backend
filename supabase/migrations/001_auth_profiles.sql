
-- ==========================================
-- NEXORA DATABASE
-- MIGRATION 001
-- AUTHENTICATION & USER PROFILES
-- ==========================================


-- 1. THEME ENUM

DO $$
BEGIN
    CREATE TYPE public.theme_preference AS ENUM (
        'light',
        'dark',
        'system'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- 2. PROFILES TABLE

CREATE TABLE IF NOT EXISTS public.profiles (

    id UUID PRIMARY KEY
        REFERENCES auth.users(id)
        ON DELETE CASCADE,

    full_name TEXT NOT NULL DEFAULT '',

    username TEXT,

    avatar_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


-- Username must be unique (case-insensitive)

CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique
ON public.profiles (LOWER(username))
WHERE username IS NOT NULL;


-- 3. USER PREFERENCES TABLE

CREATE TABLE IF NOT EXISTS public.user_preferences (

    user_id UUID PRIMARY KEY
        REFERENCES public.profiles(id)
        ON DELETE CASCADE,

    theme public.theme_preference NOT NULL DEFAULT 'system',

    notification_preferences JSONB NOT NULL DEFAULT
    '{
        "task_assignments": true,
        "mentions_comments": true,
        "chat_messages": true,
        "weekly_digest": false
    }'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);


-- 4. UPDATED_AT FUNCTION

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN

    NEW.updated_at = NOW();

    RETURN NEW;

END;
$$;


-- 5. PROFILES UPDATED_AT TRIGGER

DROP TRIGGER IF EXISTS set_profiles_updated_at
ON public.profiles;

CREATE TRIGGER set_profiles_updated_at

BEFORE UPDATE ON public.profiles

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


-- 6. USER PREFERENCES UPDATED_AT TRIGGER

DROP TRIGGER IF EXISTS set_user_preferences_updated_at
ON public.user_preferences;

CREATE TRIGGER set_user_preferences_updated_at

BEFORE UPDATE ON public.user_preferences

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


-- 7. AUTO CREATE PROFILE AFTER AUTH USER CREATION

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN

    INSERT INTO public.profiles (
        id,
        full_name
    )

    VALUES (
        NEW.id,
        COALESCE(
            NEW.raw_user_meta_data ->> 'full_name',
            ''
        )
    )

    ON CONFLICT (id) DO NOTHING;


    INSERT INTO public.user_preferences (
        user_id
    )

    VALUES (
        NEW.id
    )

    ON CONFLICT (user_id) DO NOTHING;


    RETURN NEW;

END;
$$;


-- 8. AUTH USER TRIGGER

DROP TRIGGER IF EXISTS on_auth_user_created
ON auth.users;

CREATE TRIGGER on_auth_user_created

AFTER INSERT ON auth.users

FOR EACH ROW

EXECUTE FUNCTION public.handle_new_auth_user();


-- 9. CREATE PROFILES FOR EXISTING AUTH USERS

INSERT INTO public.profiles (
    id,
    full_name
)

SELECT
    id,
    COALESCE(
        raw_user_meta_data ->> 'full_name',
        ''
    )

FROM auth.users

ON CONFLICT (id) DO NOTHING;


-- 10. CREATE DEFAULT PREFERENCES FOR EXISTING USERS

INSERT INTO public.user_preferences (
    user_id
)

SELECT id
FROM public.profiles

ON CONFLICT (user_id) DO NOTHING;


-- 11. ENABLE ROW LEVEL SECURITY

ALTER TABLE public.profiles
ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.user_preferences
ENABLE ROW LEVEL SECURITY;


-- 12. PROFILES POLICIES

DROP POLICY IF EXISTS profiles_select_own
ON public.profiles;

CREATE POLICY profiles_select_own
ON public.profiles

FOR SELECT

TO authenticated

USING (
    (SELECT auth.uid()) = id
);


DROP POLICY IF EXISTS profiles_update_own
ON public.profiles;

CREATE POLICY profiles_update_own
ON public.profiles

FOR UPDATE

TO authenticated

USING (
    (SELECT auth.uid()) = id
)

WITH CHECK (
    (SELECT auth.uid()) = id
);


-- 13. USER PREFERENCES POLICIES

DROP POLICY IF EXISTS preferences_select_own
ON public.user_preferences;

CREATE POLICY preferences_select_own
ON public.user_preferences

FOR SELECT

TO authenticated

USING (
    (SELECT auth.uid()) = user_id
);


DROP POLICY IF EXISTS preferences_update_own
ON public.user_preferences;

CREATE POLICY preferences_update_own
ON public.user_preferences

FOR UPDATE

TO authenticated

USING (
    (SELECT auth.uid()) = user_id
)

WITH CHECK (
    (SELECT auth.uid()) = user_id
);
