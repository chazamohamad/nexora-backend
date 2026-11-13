
-- =====================================================
-- NEXORA DATABASE
-- MIGRATION 004
-- CHAT & FILE MANAGEMENT
-- =====================================================


-- =====================================================
-- 1. MESSAGES TABLE
-- One conversation per workspace
-- =====================================================

CREATE TABLE IF NOT EXISTS public.messages (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL
        REFERENCES public.workspaces(id)
        ON DELETE CASCADE,

    sender_id UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT,

    content TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT messages_content_not_empty
        CHECK (LENGTH(BTRIM(content)) > 0),

    CONSTRAINT messages_id_workspace_unique
        UNIQUE (id, workspace_id)

);


-- Message indexes

CREATE INDEX IF NOT EXISTS idx_messages_workspace_created
ON public.messages(workspace_id, created_at DESC);


CREATE INDEX IF NOT EXISTS idx_messages_sender
ON public.messages(sender_id);


-- =====================================================
-- 2. FILES TABLE
-- Supports Task and Chat Attachments
-- =====================================================

CREATE TABLE IF NOT EXISTS public.files (

    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    workspace_id UUID NOT NULL,

    task_id UUID,

    message_id UUID,

    uploaded_by UUID NOT NULL
        REFERENCES public.profiles(id)
        ON DELETE RESTRICT,

    bucket_id TEXT NOT NULL DEFAULT 'nexora-files',

    storage_path TEXT NOT NULL,

    file_name TEXT NOT NULL,

    mime_type TEXT NOT NULL,

    size_bytes BIGINT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),


    -- A file must belong to exactly one parent

    CONSTRAINT files_one_parent
        CHECK (
            (task_id IS NOT NULL)
            <>
            (message_id IS NOT NULL)
        ),


    -- File metadata must point to the correct bucket

    CONSTRAINT files_bucket_name
        CHECK (bucket_id = 'nexora-files'),


    -- Validate storage path structure:
    -- workspace_id / uploaded_by / filename

    CONSTRAINT files_storage_path_format
        CHECK (
            SPLIT_PART(storage_path, '/', 1) = workspace_id::TEXT
            AND SPLIT_PART(storage_path, '/', 2) = uploaded_by::TEXT
            AND SPLIT_PART(storage_path, '/', 3) <> ''
        ),


    CONSTRAINT files_name_not_empty
        CHECK (LENGTH(BTRIM(file_name)) > 0),


    CONSTRAINT files_mime_type_not_empty
        CHECK (LENGTH(BTRIM(mime_type)) > 0),


    CONSTRAINT files_size_nonnegative
        CHECK (size_bytes >= 0),


    -- Task must belong to the same workspace

    CONSTRAINT files_task_workspace_fk
        FOREIGN KEY (task_id, workspace_id)
        REFERENCES public.tasks(id, workspace_id)
        ON DELETE RESTRICT,


    -- Message must belong to the same workspace

    CONSTRAINT files_message_workspace_fk
        FOREIGN KEY (message_id, workspace_id)
        REFERENCES public.messages(id, workspace_id)
        ON DELETE RESTRICT,


    CONSTRAINT files_storage_path_unique
        UNIQUE (bucket_id, storage_path)

);


-- File indexes

CREATE INDEX IF NOT EXISTS idx_files_workspace
ON public.files(workspace_id);


CREATE INDEX IF NOT EXISTS idx_files_task
ON public.files(task_id)
WHERE task_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_files_message
ON public.files(message_id)
WHERE message_id IS NOT NULL;


CREATE INDEX IF NOT EXISTS idx_files_uploaded_by
ON public.files(uploaded_by);


-- =====================================================
-- 3. VALIDATE MESSAGE SENDER
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

            AND wm.status = 'active'::public.membership_status

        ) THEN

            RAISE EXCEPTION
                'Message sender must be an active workspace member';

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


DROP TRIGGER IF EXISTS validate_message_membership_trigger
ON public.messages;


CREATE TRIGGER validate_message_membership_trigger

BEFORE INSERT OR UPDATE ON public.messages

FOR EACH ROW

EXECUTE FUNCTION public.validate_message_membership();


-- =====================================================
-- 4. VALIDATE FILE UPLOADER
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

        AND wm.status = 'active'::public.membership_status

    ) THEN

        RAISE EXCEPTION
            'File uploader must be an active workspace member';

    END IF;


    RETURN NEW;

END;

$$;


DROP TRIGGER IF EXISTS validate_file_uploader_trigger
ON public.files;


CREATE TRIGGER validate_file_uploader_trigger

BEFORE INSERT ON public.files

FOR EACH ROW

EXECUTE FUNCTION public.validate_file_uploader();


-- =====================================================
-- 5. UPDATED_AT TRIGGER FOR MESSAGES
-- Uses the function created in Migration 001
-- =====================================================

DROP TRIGGER IF EXISTS set_messages_updated_at
ON public.messages;


CREATE TRIGGER set_messages_updated_at

BEFORE UPDATE ON public.messages

FOR EACH ROW

EXECUTE FUNCTION public.set_updated_at();


-- =====================================================
-- 6. ENABLE ROW LEVEL SECURITY
-- =====================================================

ALTER TABLE public.messages
ENABLE ROW LEVEL SECURITY;


ALTER TABLE public.files
ENABLE ROW LEVEL SECURITY;


-- =====================================================
-- 7. MESSAGES POLICIES
-- =====================================================


-- Active members can read workspace messages

DROP POLICY IF EXISTS messages_select_members
ON public.messages;


CREATE POLICY messages_select_members

ON public.messages

FOR SELECT

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


-- Active members can send messages as themselves

DROP POLICY IF EXISTS messages_insert_members
ON public.messages;


CREATE POLICY messages_insert_members

ON public.messages

FOR INSERT

TO authenticated

WITH CHECK (

    sender_id = (SELECT auth.uid())

    AND public.is_active_workspace_member(workspace_id)

);


-- Sender or workspace admin can edit messages

DROP POLICY IF EXISTS messages_update_author_admin
ON public.messages;


CREATE POLICY messages_update_author_admin

ON public.messages

FOR UPDATE

TO authenticated

USING (

    public.is_active_workspace_member(workspace_id)

    AND (

        sender_id = (SELECT auth.uid())

        OR public.is_workspace_admin(workspace_id)

    )

)

WITH CHECK (

    public.is_active_workspace_member(workspace_id)

    AND (

        sender_id = (SELECT auth.uid())

        OR public.is_workspace_admin(workspace_id)

    )

);


-- Sender or workspace admin can delete messages

DROP POLICY IF EXISTS messages_delete_author_admin
ON public.messages;


CREATE POLICY messages_delete_author_admin

ON public.messages

FOR DELETE

TO authenticated

USING (

    public.is_active_workspace_member(workspace_id)

    AND (

        sender_id = (SELECT auth.uid())

        OR public.is_workspace_admin(workspace_id)

    )

);


-- =====================================================
-- 8. FILES POLICIES
-- =====================================================


-- Workspace members can view file metadata

DROP POLICY IF EXISTS files_select_members
ON public.files;


CREATE POLICY files_select_members

ON public.files

FOR SELECT

TO authenticated

USING (
    public.is_active_workspace_member(workspace_id)
);


-- Members can register their own uploaded files

DROP POLICY IF EXISTS files_insert_own
ON public.files;


CREATE POLICY files_insert_own

ON public.files

FOR INSERT

TO authenticated

WITH CHECK (

    uploaded_by = (SELECT auth.uid())

    AND public.is_active_workspace_member(workspace_id)

);


-- Uploader or workspace admin can delete file metadata

DROP POLICY IF EXISTS files_delete_own_admin
ON public.files;


CREATE POLICY files_delete_own_admin

ON public.files

FOR DELETE

TO authenticated

USING (

    public.is_active_workspace_member(workspace_id)

    AND (

        uploaded_by = (SELECT auth.uid())

        OR public.is_workspace_admin(workspace_id)

    )

);


-- =====================================================
-- 9. CREATE PRIVATE SUPABASE STORAGE BUCKET
-- =====================================================

INSERT INTO storage.buckets (
    id,
    name,
    public
)

VALUES (
    'nexora-files',
    'nexora-files',
    FALSE
)

ON CONFLICT (id)

DO UPDATE SET
    public = FALSE;


-- =====================================================
-- 10. STORAGE OBJECT POLICIES
-- Expected object path:
-- workspace_id / uploader_id / unique_filename
-- =====================================================


-- Workspace members can view stored files

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

        AND wm.status = 'active'::public.membership_status

    )

);


-- Members can upload files into their own folder

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

        AND wm.status = 'active'::public.membership_status

    )

);


-- Uploader or workspace admin can delete storage objects

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

        AND wm.status = 'active'::public.membership_status

        AND (

            (storage.foldername(name))[2] =
                (SELECT auth.uid())::TEXT

            OR wm.role = 'admin'::public.workspace_role

        )

    )

);


-- =====================================================
-- 11. TABLE PERMISSIONS
-- =====================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.messages
TO authenticated;


GRANT SELECT, INSERT, DELETE
ON public.files
TO authenticated;


-- Backend service role permissions

GRANT ALL
ON public.messages,
   public.files
TO service_role;


-- =====================================================
-- MIGRATION 004 COMPLETED
-- =====================================================
