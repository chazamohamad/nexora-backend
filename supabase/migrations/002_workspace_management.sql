
-- =====================================================
-- NEXORA DATABASE
-- MIGRATION 002
-- WORKSPACE MANAGEMENT
-- =====================================================


-- =====================================================
-- 1. CREATE ENUM TYPES
-- =====================================================

DO $$
BEGIN
    CREATE TYPE public.workspace_role AS ENUM (
        'admin',
        'contributor'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE public.membership_status AS ENUM (
        'active',
        'removed'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE public.invitation_status AS ENUM (
        'pending',
        'accepted',
        'expired',
        'revoked'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- =====================================================
-- 2. WORKSPACES TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.workspaces (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,

    slug TEXT NOT NULL,

    description TEXT,

    color TEXT NOT NULL DEFAULT '#0B515C',

    icon TEXT NOT NULL DEFAULT 'layers',

    created_by UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT,

    settings JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT workspaces_name_not_empty
        CHECK (LENGTH(BTRIM(name)) > 0),

    CONSTRAINT workspaces_slug_format
        CHECK (
            slug = LOWER(BTRIM(slug))
            AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        ),

    CONSTRAINT workspaces_color_format
        CHECK (color ~ '^#[0-9A-Fa-f]{6}$')

);


-- Unique workspace slug, case-insensitive

CREATE UNIQUE INDEX IF NOT EXISTS workspaces_slug_unique
ON public.workspaces (LOWER(slug));


-- Index for workspace creator

CREATE INDEX IF NOT EXISTS idx_workspaces_created_by
ON public.workspaces(created_by);


-- =====================================================
-- 3. WORKSPACE MEMBERS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.workspace_members (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    user_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE CASCADE,

    role public.workspace_role NOT NULL DEFAULT 'contributor',

    status public.membership_status NOT NULL DEFAULT 'active',

    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_workspace_member
        UNIQUE (workspace_id, user_id)

);


-- Membership indexes

CREATE INDEX IF NOT EXISTS idx_workspace_members_user
ON public.workspace_members(user_id, status);


CREATE INDEX IF NOT EXISTS idx_workspace_members_workspace
ON public.workspace_members(workspace_id, status);


-- =====================================================
-- 4. WORKSPACE INVITATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.workspace_invitations (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    invited_by UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    email TEXT NOT NULL,

    role public.workspace_role NOT NULL DEFAULT 'contributor',

    token_hash TEXT NOT NULL UNIQUE,

    status public.invitation_status NOT NULL DEFAULT 'pending',

    expires_at TIMESTAMPTZ NOT NULL
        DEFAULT (NOW() + INTERVAL '7 days'),

    accepted_by UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    accepted_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT invitation_email_normalized
        CHECK (email = LOWER(BTRIM(email))),

    CONSTRAINT invitation_expiration_valid
        CHECK (expires_at > created_at)

);


-- Invitation indexes

CREATE INDEX IF NOT EXISTS idx_invitations_workspace
ON public.workspace_invitations(workspace_id, status);


CREATE INDEX IF NOT EXISTS idx_invitations_email
ON public.workspace_invitations(LOWER(email));


-- =====================================================
-- 5. CHECK ACTIVE WORKSPACE MEMBERSHIP
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_active_workspace_member(
    target_workspace_id UUID
)
RETURNS BOOLEAN

LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''

AS $$

    SELECT EXISTS (

        SELECT 1

        FROM public.workspace_members wm

        WHERE wm.workspace_id = target_workspace_id

        AND wm.user_id = (SELECT auth.uid())

        AND wm.status = 'active'::public.membership_status

    );

$$;


-- =====================================================
-- 6. CHECK WORKSPACE ADMIN ROLE
-- =====================================================

CREATE OR REPLACE FUNCTION public.is_workspace_admin(
    target_workspace_id UUID
)
RETURNS BOOLEAN

LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''

AS $$

    SELECT EXISTS (

        SELECT 1

        FROM public.workspace_members wm

        WHERE wm.workspace_id = target_workspace_id

        AND wm.user_id = (SELECT auth.uid())

        AND wm.role = 'admin'::public.workspace_role

        AND wm.status = 'active'::public.membership_status

    );

$$;


-- Secure function execution

REVOKE ALL ON FUNCTION
public.is_active_workspace_member(UUID)
FROM PUBLIC;

REVOKE ALL ON FUNCTION
public.is_workspace_admin(UUID)
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
public.is_active_workspace_member(UUID)
TO authenticated;

GRANT EXECUTE ON FUNCTION
public.is_workspace_admin(UUID)
TO authenticated;


-- =====================================================
-- 7. AUTOMATICALLY ADD WORKSPACE CREATOR AS ADMIN
-- =====================================================

CREATE OR REPLACE FUNCTION public.add_workspace_creator_as_admin()

RETURNS TRIGGER

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $$

BEGIN

    IF NEW.created_by IS NULL THEN

        RAISE EXCEPTION 'Workspace creator is required';

    END IF;


    INSERT INTO public.workspace_members (

        workspace_id,

        user_id,

        role,

        status

    )

    VALUES (

        NEW.id,

        NEW.created_by,

        'admin'::public.workspace_role,

        'active'::public.membership_status

    )

    ON CONFLICT (workspace_id, user_id)
    DO NOTHING;


    RETURN NEW;

END;

$$;


DROP TRIGGER IF EXISTS on_workspace_created
ON public.workspaces;


CREATE TRIGGER on_workspace_created

AFTER INSERT ON public.workspaces

FOR EACH ROW

EXECUTE FUNCTION public.add_workspace_creator_as_admin();


-- =====================================================
-- 8. PROTECT WORKSPACE CREATOR
-- =====================================================

CREATE OR REPLACE FUNCTION public.prevent_workspace_creator_change()

RETURNS TRIGGER

LANGUAGE plpgsql

SET search_path = ''

AS $$

BEGIN

    IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN

        RAISE EXCEPTION 'Workspace creator cannot be changed';

    END IF;


    RETURN NEW;

END;

$$;


DROP TRIGGER IF EXISTS protect_workspace_creator
ON public.workspaces;


CREATE TRIGGER protect_workspace_creator

BEFORE UPDATE ON public.workspaces

FOR EACH ROW

EXECUTE FUNCTION public.prevent_workspace_creator_change();


-- =====================================================
-- 9. PREVENT CHANGING MEMBERSHIP IDENTITY
-- =====================================================

CREATE OR REPLACE FUNCTION public.prevent_member_identity_change()

RETURNS TRIGGER

LANGUAGE plpgsql

SET search_path = ''

AS $$

BEGIN

    IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id

       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN

        RAISE EXCEPTION 'Workspace membership identity cannot be changed';

    END IF;


    RETURN NEW;

END;

$$;


DROP TRIGGER IF EXISTS protect_workspace_member_identity
ON public.workspace_members;


CREATE TRIGGER protect_workspace_member_identity

BEFORE UPDATE ON public.workspace_members

FOR EACH ROW

EXECUTE FUNCTION public.prevent_member_identity_change();


-- =====================================================
-- 10. UPDATED_AT TRIGGER FOR WORKSPACES
-- =====================================================

DROP TRIGGER IF EXISTS set_workspaces_updated_at
ON public.workspaces;


CREATE TRIGGER set_workspaces_updated_at

BEFORE UPDATE ON public.workspaces

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


-- =====================================================
-- 11. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.workspaces
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.workspace_members
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.workspace_invitations
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- 12. WORKSPACES POLICIES
-- =====================================================

DROP POLICY IF EXISTS workspaces_select_members
ON public.workspaces;


CREATE POLICY workspaces_select_members

ON public.workspaces

FOR SELECT

TO authenticated

USING (
    public.is_active_workspace_member(id)
);


DROP POLICY IF EXISTS workspaces_insert_own
ON public.workspaces;


CREATE POLICY workspaces_insert_own

ON public.workspaces

FOR INSERT

TO authenticated

WITH CHECK (
    created_by = (SELECT auth.uid())
);


DROP POLICY IF EXISTS workspaces_update_admin
ON public.workspaces;


CREATE POLICY workspaces_update_admin

ON public.workspaces

FOR UPDATE

TO authenticated

USING (
    public.is_workspace_admin(id)
)

WITH CHECK (
    public.is_workspace_admin(id)
);


DROP POLICY IF EXISTS workspaces_delete_admin
ON public.workspaces;


CREATE POLICY workspaces_delete_admin

ON public.workspaces

FOR DELETE

TO authenticated

USING (
    public.is_workspace_admin(id)
);


-- =====================================================
-- 13. WORKSPACE MEMBERS POLICIES
-- =====================================================

DROP POLICY IF EXISTS members_select_workspace
ON public.workspace_members;


CREATE POLICY members_select_workspace

ON public.workspace_members

FOR SELECT

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


DROP POLICY IF EXISTS members_update_admin
ON public.workspace_members;


CREATE POLICY members_update_admin

ON public.workspace_members

FOR UPDATE

TO authenticated

USING (
    public.is_workspace_admin(workspace_id)
)

WITH CHECK (
    public.is_workspace_admin(workspace_id)
);


-- =====================================================
-- 14. INVITATIONS POLICIES
-- =====================================================

DROP POLICY IF EXISTS invitations_select_admin
ON public.workspace_invitations;


CREATE POLICY invitations_select_admin

ON public.workspace_invitations

FOR SELECT

TO authenticated

USING (
    public.is_workspace_admin(workspace_id)
);


-- Invitation creation, acceptance and revocation
-- will be handled through secure backend APIs.
-- No direct INSERT / UPDATE / DELETE policies
-- are granted to regular authenticated clients.


-- =====================================================
-- 15. ALLOW MEMBERS TO VIEW TEAM PROFILES
-- =====================================================

DROP POLICY IF EXISTS profiles_select_workspace_members
ON public.profiles;


CREATE POLICY profiles_select_workspace_members

ON public.profiles

FOR SELECT

TO authenticated

USING (

    id = (SELECT auth.uid())

    OR EXISTS (

        SELECT 1

        FROM public.workspace_members wm

        WHERE wm.user_id = profiles.id

        AND wm.status = 'active'

        AND public.is_active_workspace_member(wm.workspace_id)

    )

);


-- =====================================================
-- 16. TABLE PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.workspaces
TO authenticated;


GRANT SELECT, UPDATE
ON public.workspace_members
TO authenticated;


GRANT SELECT
ON public.workspace_invitations
TO authenticated;


-- Backend service role permissions

GRANT ALL
ON public.workspaces,
   public.workspace_members,
   public.workspace_invitations
TO service_role;


-- =====================================================
-- MIGRATION 002 COMPLETED
-- =====================================================
