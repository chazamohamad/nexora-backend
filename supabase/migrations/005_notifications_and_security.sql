
-- =====================================================
-- NEXORA DATABASE
-- MIGRATION 005
-- NOTIFICATIONS & ACTIVITY LOGS
-- =====================================================


-- =====================================================
-- 1. CREATE ENUM TYPES
-- =====================================================

DO $$
BEGIN
    CREATE TYPE public.notification_type AS ENUM (
        'task_assigned',
        'task_updated',
        'task_completed',
        'workspace_invitation',
        'new_message'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE public.activity_entity_type AS ENUM (
        'workspace',
        'task',
        'message',
        'member',
        'invitation'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- =====================================================
-- 2. NOTIFICATIONS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.notifications (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    user_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE CASCADE,

    workspace_id UUID
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    type public.notification_type NOT NULL,

    title TEXT NOT NULL,

    body TEXT,

    related_task_id UUID
        REFERENCES public.tasks(id)
        ON DELETE SET NULL,

    related_message_id UUID
        REFERENCES public.messages(id)
        ON DELETE SET NULL,

    related_invitation_id UUID
        REFERENCES public.workspace_invitations(id)
        ON DELETE SET NULL,

    is_read BOOLEAN NOT NULL DEFAULT FALSE,

    read_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT notifications_title_not_empty
        CHECK (LENGTH(BTRIM(title)) > 0),

    -- A notification can reference at most one entity

    CONSTRAINT notifications_single_reference
        CHECK (
            NUM_NONNULLS(
                related_task_id,
                related_message_id,
                related_invitation_id
            ) <= 1
        ),

    -- A related entity requires a workspace

    CONSTRAINT notifications_workspace_required
        CHECK (
            NUM_NONNULLS(
                related_task_id,
                related_message_id,
                related_invitation_id
            ) = 0
            OR workspace_id IS NOT NULL
        ),

    -- Read status and read timestamp must agree

    CONSTRAINT notifications_read_state
        CHECK (
            (is_read = TRUE AND read_at IS NOT NULL)
            OR
            (is_read = FALSE AND read_at IS NULL)
        )

);


-- =====================================================
-- 3. NOTIFICATION INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
ON public.notifications(user_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
ON public.notifications(user_id, created_at DESC)
WHERE is_read = FALSE;


CREATE INDEX IF NOT EXISTS idx_notifications_workspace
ON public.notifications(workspace_id);


CREATE INDEX IF NOT EXISTS idx_notifications_task
ON public.notifications(related_task_id)
WHERE related_task_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_notifications_message
ON public.notifications(related_message_id)
WHERE related_message_id IS NOT NULL;


-- =====================================================
-- 4. VALIDATE NOTIFICATION REFERENCES
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_notification_context()

RETURNS TRIGGER

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $$

DECLARE
    related_workspace_id UUID;

BEGIN

    -- Validate related task

    IF NEW.related_task_id IS NOT NULL THEN

        SELECT t.workspace_id
        INTO related_workspace_id

        FROM public.tasks t

        WHERE t.id = NEW.related_task_id;


        IF NOT FOUND THEN

            RAISE EXCEPTION 'Related task does not exist';

        END IF;


        IF NEW.workspace_id IS DISTINCT FROM related_workspace_id THEN

            RAISE EXCEPTION
                'Notification workspace does not match related task workspace';

        END IF;

    END IF;


    -- Validate related message

    IF NEW.related_message_id IS NOT NULL THEN

        SELECT m.workspace_id
        INTO related_workspace_id

        FROM public.messages m

        WHERE m.id = NEW.related_message_id;


        IF NOT FOUND THEN

            RAISE EXCEPTION 'Related message does not exist';

        END IF;


        IF NEW.workspace_id IS DISTINCT FROM related_workspace_id THEN

            RAISE EXCEPTION
                'Notification workspace does not match related message workspace';

        END IF;

    END IF;


    -- Validate related invitation

    IF NEW.related_invitation_id IS NOT NULL THEN

        SELECT i.workspace_id
        INTO related_workspace_id

        FROM public.workspace_invitations i

        WHERE i.id = NEW.related_invitation_id;


        IF NOT FOUND THEN

            RAISE EXCEPTION 'Related invitation does not exist';

        END IF;


        IF NEW.workspace_id IS DISTINCT FROM related_workspace_id THEN

            RAISE EXCEPTION
                'Notification workspace does not match invitation workspace';

        END IF;

    END IF;


    RETURN NEW;

END;

$$;


REVOKE ALL ON FUNCTION
public.validate_notification_context()
FROM PUBLIC;


DROP TRIGGER IF EXISTS validate_notification_context_trigger
ON public.notifications;


CREATE TRIGGER validate_notification_context_trigger

BEFORE INSERT OR UPDATE ON public.notifications

FOR EACH ROW

EXECUTE FUNCTION public.validate_notification_context();


-- =====================================================
-- 5. AUTOMATICALLY MANAGE READ TIMESTAMP
-- =====================================================

CREATE OR REPLACE FUNCTION public.sync_notification_read_at()

RETURNS TRIGGER

LANGUAGE plpgsql

SET search_path = ''

AS $$

BEGIN

    IF NEW.is_read = TRUE THEN

        NEW.read_at := COALESCE(NEW.read_at, NOW());

    ELSE

        NEW.read_at := NULL;

    END IF;


    RETURN NEW;

END;

$$;


DROP TRIGGER IF EXISTS sync_notification_read_at_trigger
ON public.notifications;


CREATE TRIGGER sync_notification_read_at_trigger

BEFORE INSERT OR UPDATE OF is_read, read_at

ON public.notifications

FOR EACH ROW

EXECUTE FUNCTION public.sync_notification_read_at();


-- =====================================================
-- 6. ACTIVITY LOGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.activity_logs (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    actor_id UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    entity_type public.activity_entity_type NOT NULL,

    entity_id UUID NOT NULL,

    action TEXT NOT NULL,

    description TEXT,

    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT activity_action_not_empty
        CHECK (LENGTH(BTRIM(action)) > 0)

);


-- =====================================================
-- 7. ACTIVITY LOG INDEXES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_activity_workspace_created
ON public.activity_logs(workspace_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_activity_actor
ON public.activity_logs(actor_id);


CREATE INDEX IF NOT EXISTS idx_activity_entity
ON public.activity_logs(entity_type, entity_id);


-- =====================================================
-- 8. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.notifications
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.activity_logs
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- 9. NOTIFICATIONS POLICIES
-- =====================================================


-- Users can only read their own notifications

DROP POLICY IF EXISTS notifications_select_own
ON public.notifications;


CREATE POLICY notifications_select_own

ON public.notifications

FOR SELECT

TO authenticated

USING (
    user_id = (SELECT auth.uid())
);


-- Users can only update their own notifications

DROP POLICY IF EXISTS notifications_update_own
ON public.notifications;


CREATE POLICY notifications_update_own

ON public.notifications

FOR UPDATE

TO authenticated

USING (
    user_id = (SELECT auth.uid())
)

WITH CHECK (
    user_id = (SELECT auth.uid())
);


-- No direct INSERT or DELETE policies.
-- Backend creates and manages notifications.


-- =====================================================
-- 10. ACTIVITY LOGS POLICIES
-- =====================================================


-- Active workspace members can read activity logs

DROP POLICY IF EXISTS activity_select_members
ON public.activity_logs;


CREATE POLICY activity_select_members

ON public.activity_logs

FOR SELECT

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


-- Activity log creation is handled by the backend.
-- No direct INSERT, UPDATE or DELETE policies.


-- =====================================================
-- 11. RESTRICT TABLE PERMISSIONS
-- =====================================================


-- Notifications:
-- Read all own notification fields.
-- Update only is_read.
-- read_at is managed by the database trigger.

REVOKE ALL PRIVILEGES
ON TABLE public.notifications
FROM PUBLIC, anon, authenticated;


GRANT SELECT
ON public.notifications
TO authenticated;


GRANT UPDATE (is_read)
ON public.notifications
TO authenticated;


-- Activity logs:
-- Authenticated users can only read allowed records.

REVOKE ALL PRIVILEGES
ON TABLE public.activity_logs
FROM PUBLIC, anon, authenticated;


GRANT SELECT
ON public.activity_logs
TO authenticated;


-- Backend service role:
-- Trusted backend manages notification creation
-- and activity log creation.

GRANT ALL
ON public.notifications,
   public.activity_logs
TO service_role;


-- =====================================================
-- 12. GRANT ENUM PERMISSIONS
-- =====================================================

GRANT USAGE ON TYPE public.notification_type
TO authenticated, service_role;


GRANT USAGE ON TYPE public.activity_entity_type
TO authenticated, service_role;


-- =====================================================
-- MIGRATION 005 COMPLETED
-- =====================================================
