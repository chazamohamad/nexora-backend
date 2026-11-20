
-- =====================================================
-- NEXORA DATABASE
-- MIGRATION 006
-- SCHEMA CLEANUP
-- =====================================================

BEGIN;


-- =====================================================
-- 1. REMOVE PREVIOUSLY REMOVED MEMBERSHIPS
-- =====================================================

-- A membership row will now mean an active membership.
-- Preserve active members and remove previously removed rows.

DELETE FROM public.workspace_members
WHERE status = 'removed'::public.membership_status;


-- =====================================================
-- 2. UPDATE ACTIVE MEMBERSHIP CHECK
-- =====================================================

-- A user is a member if a membership row exists.

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

    );

$$;


REVOKE ALL ON FUNCTION
public.is_active_workspace_member(UUID)
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
public.is_active_workspace_member(UUID)
TO authenticated;


COMMENT ON FUNCTION public.is_active_workspace_member(UUID)
IS 'Returns true when the authenticated user has a membership row in the workspace. Membership row existence means active membership.';


-- =====================================================
-- 3. UPDATE ADMIN CHECK
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

    );

$$;


REVOKE ALL ON FUNCTION
public.is_workspace_admin(UUID)
FROM PUBLIC;


GRANT EXECUTE ON FUNCTION
public.is_workspace_admin(UUID)
TO authenticated;


-- =====================================================
-- 4. UPDATE WORKSPACE CREATOR TRIGGER FUNCTION
-- =====================================================

-- Creator becomes admin without a membership status column.

CREATE OR REPLACE FUNCTION public.add_workspace_creator_as_admin()

RETURNS TRIGGER

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $$

BEGIN

    INSERT INTO public.workspace_members (

        workspace_id,
        user_id,
        role

    )

    VALUES (

        NEW.id,
        NEW.created_by,
        'admin'::public.workspace_role

    )

    ON CONFLICT (workspace_id, user_id)
    DO NOTHING;


    RETURN NEW;

END;

$$;


-- Existing on_workspace_created trigger remains active.


-- =====================================================
-- 5. UPDATE TASK MEMBERSHIP VALIDATION
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_task_membership()

RETURNS TRIGGER

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $$

BEGIN

    IF TG_OP = 'UPDATE' THEN

        IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN

            RAISE EXCEPTION 'Task workspace cannot be changed';

        END IF;


        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN

            RAISE EXCEPTION 'Task creator cannot be changed';

        END IF;

    END IF;


    IF TG_OP = 'INSERT' THEN

        IF NOT EXISTS (

            SELECT 1

            FROM public.workspace_members wm

            WHERE wm.workspace_id = NEW.workspace_id

            AND wm.user_id = NEW.created_by

        ) THEN

            RAISE EXCEPTION
                'Task creator must be a workspace member';

        END IF;

    END IF;


    IF NEW.assignee_id IS NOT NULL THEN

        IF NOT EXISTS (

            SELECT 1

            FROM public.workspace_members wm

            WHERE wm.workspace_id = NEW.workspace_id

            AND wm.user_id = NEW.assignee_id

        ) THEN

            RAISE EXCEPTION
                'Assignee must be a member of this workspace';

        END IF;

    END IF;


    IF NEW.status = 'done'::public.task_status THEN

        IF TG_OP = 'INSERT' THEN

            NEW.completed_at := COALESCE(NEW.completed_at, NOW());

        ELSIF OLD.status IS DISTINCT FROM NEW.status
              OR NEW.completed_at IS NULL THEN

            NEW.completed_at := NOW();

        END IF;

    ELSE

        NEW.completed_at := NULL;

    END IF;


    RETURN NEW;

END;

$$;


-- =====================================================
-- 6. UPDATE MESSAGE MEMBERSHIP VALIDATION
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_message_membership()

RETURNS TRIGGER

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $$

BEGIN

    IF TG_OP = 'INSERT' THEN

        IF NOT EXISTS (

            SELECT 1

            FROM public.workspace_members wm

            WHERE wm.workspace_id = NEW.workspace_id

            AND wm.user_id = NEW.sender_id

        ) THEN

            RAISE EXCEPTION
                'Message sender must be a workspace member';

        END IF;


    ELSIF TG_OP = 'UPDATE' THEN

        IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id

           OR NEW.sender_id IS DISTINCT FROM OLD.sender_id THEN

            RAISE EXCEPTION
                'Message identity cannot be changed';

        END IF;

    END IF;


    RETURN NEW;

END;

$$;


-- =====================================================
-- 7. UPDATE FILE UPLOADER VALIDATION
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_file_uploader()

RETURNS TRIGGER

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $$

BEGIN

    IF NOT EXISTS (

        SELECT 1

        FROM public.workspace_members wm

        WHERE wm.workspace_id = NEW.workspace_id

        AND wm.user_id = NEW.uploaded_by

    ) THEN

        RAISE EXCEPTION
            'File uploader must be a workspace member';

    END IF;


    RETURN NEW;

END;

$$;


-- =====================================================
-- 8. UPDATE PROFILES WORKSPACE MEMBERS POLICY
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

        AND public.is_active_workspace_member(wm.workspace_id)

    )

);


-- =====================================================
-- 9. UPDATE STORAGE POLICIES
-- =====================================================

-- SELECT

DROP POLICY IF EXISTS nexora_files_select_members
ON storage.objects;


CREATE POLICY nexora_files_select_members

ON storage.objects

FOR SELECT

TO authenticated

USING (

    bucket_id = 'nexora-files'

    AND EXISTS (

        SELECT 1

        FROM public.workspace_members wm

        WHERE wm.workspace_id::TEXT =
            (storage.foldername(name))[1]

        AND wm.user_id = (SELECT auth.uid())

    )

);


-- INSERT

DROP POLICY IF EXISTS nexora_files_insert_members
ON storage.objects;


CREATE POLICY nexora_files_insert_members

ON storage.objects

FOR INSERT

TO authenticated

WITH CHECK (

    bucket_id = 'nexora-files'

    AND (storage.foldername(name))[2] =
        (SELECT auth.uid())::TEXT

    AND EXISTS (

        SELECT 1

        FROM public.workspace_members wm

        WHERE wm.workspace_id::TEXT =
            (storage.foldername(name))[1]

        AND wm.user_id = (SELECT auth.uid())

    )

);


-- DELETE
-- The current user must be a member.
-- Only the uploader or an admin can delete.

DROP POLICY IF EXISTS nexora_files_delete_own_admin
ON storage.objects;


CREATE POLICY nexora_files_delete_own_admin

ON storage.objects

FOR DELETE

TO authenticated

USING (

    bucket_id = 'nexora-files'

    AND EXISTS (

        SELECT 1

        FROM public.workspace_members wm

        WHERE wm.workspace_id::TEXT =
            (storage.foldername(name))[1]

        AND wm.user_id = (SELECT auth.uid())

        AND (

            (storage.foldername(name))[2] =
                (SELECT auth.uid())::TEXT

            OR wm.role = 'admin'::public.workspace_role

        )

    )

);


-- =====================================================
-- 10. REMOVE WORKSPACE COLUMNS
-- =====================================================

DROP INDEX IF EXISTS public.workspaces_slug_unique;


ALTER TABLE public.workspaces

    DROP COLUMN IF EXISTS slug,

    DROP COLUMN IF EXISTS color,

    DROP COLUMN IF EXISTS icon,

    DROP COLUMN IF EXISTS settings;


-- =====================================================
-- 11. REMOVE WORKSPACE MEMBER STATUS
-- =====================================================

ALTER TABLE public.workspace_members

    DROP COLUMN IF EXISTS status;


-- Membership is now determined by row existence.
-- Removed members must be deleted from workspace_members.


DROP TYPE IF EXISTS public.membership_status;


COMMENT ON TABLE public.workspace_members
IS 'Workspace membership and roles. A row represents an active membership. Removing a member means deleting their membership row.';


-- =====================================================
-- 12. REMOVE TASK POSITION
-- =====================================================

DROP INDEX IF EXISTS public.idx_tasks_workspace_status;


ALTER TABLE public.tasks

    DROP COLUMN IF EXISTS position;


-- Keep an index for workspace task status filtering.

CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status

ON public.tasks(workspace_id, status);


-- =====================================================
-- 13. REMOVE TAGS SYSTEM
-- =====================================================

-- Remove junction table first because it references tags.

DROP TABLE IF EXISTS public.task_tags;


DROP TABLE IF EXISTS public.tags;


-- =====================================================
-- 14. COMPLETION
-- =====================================================

COMMIT;
