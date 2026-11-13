
-- =====================================================
-- NEXORA DATABASE
-- MIGRATION 003
-- TASK MANAGEMENT
-- =====================================================


-- =====================================================
-- 1. CREATE ENUM TYPES
-- =====================================================

DO $$
BEGIN
    CREATE TYPE public.task_status AS ENUM (
        'todo',
        'in_progress',
        'in_review',
        'done'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


DO $$
BEGIN
    CREATE TYPE public.task_priority AS ENUM (
        'low',
        'medium',
        'high'
    );
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;


-- =====================================================
-- 2. TASKS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tasks (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    title TEXT NOT NULL,

    description TEXT,

    status public.task_status NOT NULL DEFAULT 'todo',

    priority public.task_priority NOT NULL DEFAULT 'medium',

    assignee_id UUID
        REFERENCES public.profiles(id)
        ON DELETE SET NULL,

    created_by UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT,

    due_date DATE,

    position INTEGER NOT NULL DEFAULT 0,

    completed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT tasks_title_not_empty
        CHECK (LENGTH(BTRIM(title)) > 0),

    CONSTRAINT tasks_position_nonnegative
        CHECK (position >= 0),

    CONSTRAINT tasks_id_workspace_unique
        UNIQUE (id, workspace_id)

);


-- Task indexes

CREATE INDEX IF NOT EXISTS idx_tasks_workspace
ON public.tasks(workspace_id);


CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status
ON public.tasks(workspace_id, status, position);


CREATE INDEX IF NOT EXISTS idx_tasks_assignee
ON public.tasks(assignee_id);


CREATE INDEX IF NOT EXISTS idx_tasks_created_by
ON public.tasks(created_by);


CREATE INDEX IF NOT EXISTS idx_tasks_due_date
ON public.tasks(workspace_id, due_date);


-- =====================================================
-- 3. TAGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.tags (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    name TEXT NOT NULL,

    color TEXT NOT NULL DEFAULT '#23877F',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT tags_name_not_empty
        CHECK (LENGTH(BTRIM(name)) > 0),

    CONSTRAINT tags_color_format
        CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),

    CONSTRAINT tags_id_workspace_unique
        UNIQUE (id, workspace_id)

);


-- Prevent duplicate tag names inside one workspace

CREATE UNIQUE INDEX IF NOT EXISTS tags_workspace_name_unique
ON public.tags(workspace_id, LOWER(name));


CREATE INDEX IF NOT EXISTS idx_tags_workspace
ON public.tags(workspace_id);


-- =====================================================
-- 4. TASK_TAGS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.task_tags (

    workspace_id UUID NOT NULL,

    task_id UUID NOT NULL,

    tag_id UUID NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (task_id, tag_id),

    CONSTRAINT task_tags_task_workspace_fk
        FOREIGN KEY (task_id, workspace_id)
        REFERENCES public.tasks(id, workspace_id)
        ON DELETE CASCADE,

    CONSTRAINT task_tags_tag_workspace_fk
        FOREIGN KEY (tag_id, workspace_id)
        REFERENCES public.tags(id, workspace_id)
        ON DELETE CASCADE

);


CREATE INDEX IF NOT EXISTS idx_task_tags_tag
ON public.task_tags(tag_id);


-- =====================================================
-- 5. TASK COMMENTS TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS public.task_comments (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    task_id UUID NOT NULL,

    user_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE CASCADE,

    content TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT task_comments_content_not_empty
        CHECK (LENGTH(BTRIM(content)) > 0),

    CONSTRAINT task_comments_task_workspace_fk
        FOREIGN KEY (task_id, workspace_id)
        REFERENCES public.tasks(id, workspace_id)
        ON DELETE CASCADE

);


CREATE INDEX IF NOT EXISTS idx_task_comments_task
ON public.task_comments(task_id, created_at);


CREATE INDEX IF NOT EXISTS idx_task_comments_user
ON public.task_comments(user_id);


-- =====================================================
-- 6. VALIDATE TASK CREATOR AND ASSIGNEE
-- =====================================================

CREATE OR REPLACE FUNCTION public.validate_task_membership()

RETURNS TRIGGER

LANGUAGE plpgsql

SECURITY DEFINER

SET search_path = ''

AS $$

BEGIN

    -- Prevent changing task identity

    IF TG_OP = 'UPDATE' THEN

        IF NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN

            RAISE EXCEPTION 'Task workspace cannot be changed';

        END IF;

        IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN

            RAISE EXCEPTION 'Task creator cannot be changed';

        END IF;

    END IF;


    -- Creator must be an active workspace member when creating a task

    IF TG_OP = 'INSERT' THEN

        IF NOT EXISTS (

            SELECT 1

            FROM public.workspace_members wm

            WHERE wm.workspace_id = NEW.workspace_id

            AND wm.user_id = NEW.created_by

            AND wm.status = 'active'::public.membership_status

        ) THEN

            RAISE EXCEPTION 'Task creator must be an active workspace member';

        END IF;

    END IF;


    -- Assignee must belong to the same workspace

    IF NEW.assignee_id IS NOT NULL THEN

        IF NOT EXISTS (

            SELECT 1

            FROM public.workspace_members wm

            WHERE wm.workspace_id = NEW.workspace_id

            AND wm.user_id = NEW.assignee_id

            AND wm.status = 'active'::public.membership_status

        ) THEN

            RAISE EXCEPTION 'Assignee must be an active member of this workspace';

        END IF;

    END IF;


    -- Automatically manage completion date

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


DROP TRIGGER IF EXISTS validate_task_membership_trigger
ON public.tasks;


CREATE TRIGGER validate_task_membership_trigger

BEFORE INSERT OR UPDATE ON public.tasks

FOR EACH ROW

EXECUTE FUNCTION public.validate_task_membership();


-- =====================================================
-- 7. PROTECT TASK COMMENT IDENTITY
-- =====================================================

CREATE OR REPLACE FUNCTION public.prevent_task_comment_identity_change()

RETURNS TRIGGER

LANGUAGE plpgsql

SET search_path = ''

AS $$

BEGIN

    IF NEW.task_id IS DISTINCT FROM OLD.task_id

       OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id

       OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN

        RAISE EXCEPTION 'Task comment identity cannot be changed';

    END IF;


    RETURN NEW;

END;

$$;


DROP TRIGGER IF EXISTS protect_task_comment_identity
ON public.task_comments;


CREATE TRIGGER protect_task_comment_identity

BEFORE UPDATE ON public.task_comments

FOR EACH ROW

EXECUTE FUNCTION public.prevent_task_comment_identity_change();


-- =====================================================
-- 8. UPDATED_AT TRIGGERS
-- =====================================================

DROP TRIGGER IF EXISTS set_tasks_updated_at
ON public.tasks;


CREATE TRIGGER set_tasks_updated_at

BEFORE UPDATE ON public.tasks

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


DROP TRIGGER IF EXISTS set_task_comments_updated_at
ON public.task_comments;


CREATE TRIGGER set_task_comments_updated_at

BEFORE UPDATE ON public.task_comments

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


-- =====================================================
-- 9. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.tasks
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.tags
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.task_tags
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.task_comments
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- 10. TASKS POLICIES
-- =====================================================

-- Members can view workspace tasks

DROP POLICY IF EXISTS tasks_select_members
ON public.tasks;


CREATE POLICY tasks_select_members

ON public.tasks

FOR SELECT

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


-- Active members can create tasks

DROP POLICY IF EXISTS tasks_insert_members
ON public.tasks;


CREATE POLICY tasks_insert_members

ON public.tasks

FOR INSERT

TO authenticated

WITH CHECK (

    created_by = (SELECT auth.uid())

    AND public.is_active_workspace_member(workspace_id)

);


-- Active members can update tasks

DROP POLICY IF EXISTS tasks_update_members
ON public.tasks;


CREATE POLICY tasks_update_members

ON public.tasks

FOR UPDATE

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
)

WITH CHECK (
    public.is_active_workspace_member(workspace_id)
);


-- Active members can delete tasks

DROP POLICY IF EXISTS tasks_delete_members
ON public.tasks;


CREATE POLICY tasks_delete_members

ON public.tasks

FOR DELETE

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


-- =====================================================
-- 11. TAGS POLICIES
-- =====================================================

DROP POLICY IF EXISTS tags_select_members
ON public.tags;


CREATE POLICY tags_select_members

ON public.tags

FOR SELECT

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


DROP POLICY IF EXISTS tags_insert_members
ON public.tags;


CREATE POLICY tags_insert_members

ON public.tags

FOR INSERT

TO authenticated

WITH CHECK (
    public.is_active_workspace_member(workspace_id)
);


DROP POLICY IF EXISTS tags_update_members
ON public.tags;


CREATE POLICY tags_update_members

ON public.tags

FOR UPDATE

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
)

WITH CHECK (
    public.is_active_workspace_member(workspace_id)
);


DROP POLICY IF EXISTS tags_delete_members
ON public.tags;


CREATE POLICY tags_delete_members

ON public.tags

FOR DELETE

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


-- =====================================================
-- 12. TASK_TAGS POLICIES
-- =====================================================

DROP POLICY IF EXISTS task_tags_select_members
ON public.task_tags;


CREATE POLICY task_tags_select_members

ON public.task_tags

FOR SELECT

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


DROP POLICY IF EXISTS task_tags_insert_members
ON public.task_tags;


CREATE POLICY task_tags_insert_members

ON public.task_tags

FOR INSERT

TO authenticated

WITH CHECK (
    public.is_active_workspace_member(workspace_id)
);


DROP POLICY IF EXISTS task_tags_delete_members
ON public.task_tags;


CREATE POLICY task_tags_delete_members

ON public.task_tags

FOR DELETE

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


-- =====================================================
-- 13. TASK COMMENTS POLICIES
-- =====================================================

-- Workspace members can read comments

DROP POLICY IF EXISTS task_comments_select_members
ON public.task_comments;


CREATE POLICY task_comments_select_members

ON public.task_comments

FOR SELECT

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


-- Members can create comments using their own identity

DROP POLICY IF EXISTS task_comments_insert_own
ON public.task_comments;


CREATE POLICY task_comments_insert_own

ON public.task_comments

FOR INSERT

TO authenticated

WITH CHECK (

    user_id = (SELECT auth.uid())

    AND public.is_active_workspace_member(workspace_id)

);


-- Authors and workspace admins can edit comments

DROP POLICY IF EXISTS task_comments_update_own
ON public.task_comments;


CREATE POLICY task_comments_update_own

ON public.task_comments

FOR UPDATE

TO authenticated

USING (

    public.is_active_workspace_member(workspace_id)

    AND (

        user_id = (SELECT auth.uid())

        OR public.is_workspace_admin(workspace_id)

    )

)

WITH CHECK (

    public.is_active_workspace_member(workspace_id)

    AND (

        user_id = (SELECT auth.uid())

        OR public.is_workspace_admin(workspace_id)

    )

);


-- Authors and workspace admins can delete comments

DROP POLICY IF EXISTS task_comments_delete_own
ON public.task_comments;


CREATE POLICY task_comments_delete_own

ON public.task_comments

FOR DELETE

TO authenticated

USING (

    public.is_active_workspace_member(workspace_id)

    AND (

        user_id = (SELECT auth.uid())

        OR public.is_workspace_admin(workspace_id)

    )

);


-- =====================================================
-- 14. GRANT TABLE PERMISSIONS
-- =====================================================

GRANT USAGE ON TYPE public.task_status
TO authenticated;

GRANT USAGE ON TYPE public.task_priority
TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
ON public.tasks,
   public.tags,
   public.task_tags,
   public.task_comments
TO authenticated;


-- Backend service role permissions

GRANT ALL
ON public.tasks,
   public.tags,
   public.task_tags,
   public.task_comments
TO service_role;


-- =====================================================
-- MIGRATION 003 COMPLETED
-- =====================================================
