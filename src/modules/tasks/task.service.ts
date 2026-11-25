import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  GetWorkspaceTasksQuery,
  CreateTaskInput,
  UpdateTaskInput,
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
} from "./task.validation.js";

// ==========================================
// SERVICE ERROR
// ==========================================

export class TaskServiceError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);

    this.name = "TaskServiceError";
  }
}

// ==========================================
// SEARCH VALUE ESCAPING
// ==========================================

function escapeSearchValue(value: string): string {
  return value.replace(/[\\%"_"]/g, (character) => {
    return `\\${character}`;
  });
}

// ==========================================
// VERIFY WORKSPACE MEMBERSHIP
// ==========================================

async function verifyWorkspaceMembership(
  supabase: SupabaseClient,

  workspaceId: string,
): Promise<void> {
  const { data: isMember, error } = await supabase.rpc(
    "is_active_workspace_member",
    {
      target_workspace_id: workspaceId,
    },
  );

  if (error) {
    console.error("Membership verification error:", error);

    throw new TaskServiceError(500, "Failed to verify workspace membership");
  }

  if (!isMember) {
    throw new TaskServiceError(403, "You are not a member of this workspace");
  }
}

// ==========================================
// GET WORKSPACE TASKS
// ==========================================

export async function getWorkspaceTasks(
  supabase: SupabaseClient,

  workspaceId: string,

  filters: GetWorkspaceTasksQuery,
) {
  // 1. Verify workspace membership

  await verifyWorkspaceMembership(supabase, workspaceId);

  // 2. Initialize database query

  let query = supabase

    .from("tasks")

    .select(
      `
        *,
        creator:profiles!tasks_created_by_fkey (
          id,
          full_name,
          username,
          avatar_url
        ),
        assignee:profiles!tasks_assignee_id_fkey (
          id,
          full_name,
          username,
          avatar_url
        )
      `,
      {
        count: "exact",
      },
    )

    .eq("workspace_id", workspaceId);

  // 3. Filter by status

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  // 4. Filter by priority

  if (filters.priority) {
    query = query.eq("priority", filters.priority);
  }

  // 5. Search in title and description

  if (filters.search) {
    const searchTerm = escapeSearchValue(filters.search);

    const searchPattern = `"%${searchTerm}%"`;

    query = query.or(
      `title.ilike.${searchPattern},description.ilike.${searchPattern}`,
    );
  }

  // 6. Sort by creation date

  const ascending = filters.sortOrder === "asc";

  query = query

    .order("created_at", {
      ascending,
    })

    .order("id", {
      ascending,
    });

  // 7. Pagination

  const from = (filters.page - 1) * filters.limit;

  const to = from + filters.limit - 1;

  query = query.range(from, to);

  // 8. Execute database query

  const { data: tasks, error: tasksError, count } = await query;

  if (tasksError) {
    console.error("Get workspace tasks failed:", tasksError);

    throw new TaskServiceError(500, "Failed to retrieve workspace tasks");
  }

  // 9. Calculate pagination metadata

  const total = count ?? 0;

  const totalPages = Math.ceil(total / filters.limit);

  // 10. Return results

  return {
    tasks: tasks ?? [],

    pagination: {
      page: filters.page,

      limit: filters.limit,

      total,

      totalPages,

      hasNextPage: filters.page < totalPages,

      hasPreviousPage: filters.page > 1 && total > 0,
    },
  };
}

// ==========================================
// CREATE WORKSPACE TASK
// ==========================================

export async function createWorkspaceTask(
  supabase: SupabaseClient,

  workspaceId: string,

  userId: string,

  input: CreateTaskInput,
) {
  // 1. Verify current user membership

  await verifyWorkspaceMembership(supabase, workspaceId);

  // 2. Prepare task data

  const taskData = {
    workspace_id: workspaceId,

    title: input.title,

    created_by: userId,

    ...(input.description !== undefined && {
      description: input.description,
    }),

    ...(input.status !== undefined && {
      status: input.status,
    }),

    ...(input.priority !== undefined && {
      priority: input.priority,
    }),

    ...(input.assignee_id !== undefined && {
      assignee_id: input.assignee_id,
    }),

    ...(input.due_date !== undefined && {
      due_date: input.due_date,
    }),
  };

  // 3. Insert task into database

  const { data: task, error: taskError } = await supabase

    .from("tasks")

    .insert(taskData)

    .select("*")

    .single();

  // 4. Handle database errors

  if (taskError) {
    console.error("Create task database error:", taskError);

    const errorMessage = taskError.message.toLowerCase();

    if (errorMessage.includes("assignee must be a member")) {
      throw new TaskServiceError(
        400,
        "The assigned user is not a member of this workspace",
      );
    }

    if (taskError.code === "42501") {
      throw new TaskServiceError(
        403,
        "You are not allowed to create tasks in this workspace",
      );
    }

    if (taskError.code === "23503") {
      throw new TaskServiceError(400, "Invalid workspace or assigned user");
    }

    if (taskError.code === "P0001") {
      throw new TaskServiceError(400, "Task validation failed");
    }

    throw new TaskServiceError(500, "Failed to create task");
  }

  // 5. Return created task

  return task;
}

// ==========================================
// GET TASK DETAILS
// ==========================================

export async function getTaskDetails(
  supabase: SupabaseClient,

  taskId: string,
) {
  // 1. Get task and its workspace ID

  const { data: taskReference, error: referenceError } = await supabase

    .from("tasks")

    .select("id, workspace_id")

    .eq("id", taskId)

    .maybeSingle();

  if (referenceError) {
    console.error("Get task reference error:", referenceError);

    throw new TaskServiceError(500, "Failed to retrieve task");
  }

  if (!taskReference) {
    throw new TaskServiceError(404, "Task not found or inaccessible");
  }

  // 2. Verify workspace membership

  await verifyWorkspaceMembership(supabase, taskReference.workspace_id);

  // 3. Get complete task details

  const { data: task, error: taskError } = await supabase

    .from("tasks")

    .select(
      `
        *,
        creator:profiles!tasks_created_by_fkey (
          id,
          full_name,
          username,
          avatar_url
        ),
        assignee:profiles!tasks_assignee_id_fkey (
          id,
          full_name,
          username,
          avatar_url
        )
      `,
    )

    .eq("id", taskId)

    .maybeSingle();

  // 4. Handle database errors

  if (taskError) {
    console.error("Get task details error:", taskError);

    throw new TaskServiceError(500, "Failed to retrieve task details");
  }

  if (!task) {
    throw new TaskServiceError(404, "Task not found or inaccessible");
  }

  // 5. Return task

  return task;
}

// ==========================================
// UPDATE TASK
// ==========================================

export async function updateTask(
  supabase: SupabaseClient,

  taskId: string,

  input: UpdateTaskInput,
) {
  // 1. Get task and workspace ID

  const { data: taskReference, error: referenceError } = await supabase

    .from("tasks")

    .select("id, workspace_id")

    .eq("id", taskId)

    .maybeSingle();

  if (referenceError) {
    console.error("Get task reference error:", referenceError);

    throw new TaskServiceError(500, "Failed to retrieve task");
  }

  if (!taskReference) {
    throw new TaskServiceError(404, "Task not found or inaccessible");
  }

  // 2. Verify workspace membership

  await verifyWorkspaceMembership(supabase, taskReference.workspace_id);

  // 3. Prepare update data

  const updateData: UpdateTaskInput = {};

  if (input.title !== undefined) {
    updateData.title = input.title;
  }

  if (input.description !== undefined) {
    updateData.description = input.description;
  }

  if (input.status !== undefined) {
    updateData.status = input.status;
  }

  if (input.priority !== undefined) {
    updateData.priority = input.priority;
  }

  if (input.assignee_id !== undefined) {
    updateData.assignee_id = input.assignee_id;
  }

  if (input.due_date !== undefined) {
    updateData.due_date = input.due_date;
  }

  // 4. Update task in database

  const { data: updatedTask, error: updateError } = await supabase

    .from("tasks")

    .update(updateData)

    .eq("id", taskId)

    .select("*")

    .maybeSingle();

  // 5. Handle database errors

  if (updateError) {
    console.error("Update task database error:", updateError);

    const errorMessage = updateError.message.toLowerCase();

    if (
      errorMessage.includes("assignee must be a member") ||
      updateError.code === "23503"
    ) {
      throw new TaskServiceError(
        400,
        "The assigned user is not a member of this workspace",
      );
    }

    if (updateError.code === "42501") {
      throw new TaskServiceError(
        403,
        "You are not allowed to update this task",
      );
    }

    if (updateError.code === "23514") {
      throw new TaskServiceError(400, "Invalid task data");
    }

    if (updateError.code === "P0001") {
      throw new TaskServiceError(400, "Task validation failed");
    }

    throw new TaskServiceError(500, "Failed to update task");
  }

  if (!updatedTask) {
    throw new TaskServiceError(
      404,
      "Task not found or you are not allowed to update it",
    );
  }

  // 6. Return updated task

  return updatedTask;
}

// ==========================================
// DELETE TASK
// ==========================================

export async function deleteTask(
  supabase: SupabaseClient,

  taskId: string,
) {
  // ----------------------------------------
  // 1. GET TASK AND WORKSPACE ID
  // ----------------------------------------

  const { data: taskReference, error: referenceError } = await supabase

    .from("tasks")

    .select("id, workspace_id")

    .eq("id", taskId)

    .maybeSingle();

  if (referenceError) {
    console.error("Get task reference error:", referenceError);

    throw new TaskServiceError(500, "Failed to retrieve task");
  }

  if (!taskReference) {
    throw new TaskServiceError(404, "Task not found or inaccessible");
  }

  // ----------------------------------------
  // 2. VERIFY WORKSPACE MEMBERSHIP
  // ----------------------------------------

  await verifyWorkspaceMembership(supabase, taskReference.workspace_id);

  // ----------------------------------------
  // 3. CHECK TASK ATTACHMENTS
  // ----------------------------------------

  const { data: attachments, error: attachmentsError } = await supabase

    .from("files")

    .select("id")

    .eq("task_id", taskId)

    .eq("workspace_id", taskReference.workspace_id)

    .limit(1);

  if (attachmentsError) {
    console.error("Check task attachments error:", attachmentsError);

    throw new TaskServiceError(500, "Failed to check task attachments");
  }

  if (attachments && attachments.length > 0) {
    throw new TaskServiceError(
      409,
      "Cannot delete this task because it has file attachments. Remove the attachments first.",
    );
  }

  // ----------------------------------------
  // 4. DELETE TASK FROM DATABASE
  // ----------------------------------------

  const { data: deletedTask, error: deleteError } = await supabase

    .from("tasks")

    .delete()

    .eq("id", taskId)

    .eq("workspace_id", taskReference.workspace_id)

    .select("id")

    .maybeSingle();

  // ----------------------------------------
  // 5. HANDLE DATABASE ERRORS
  // ----------------------------------------

  if (deleteError) {
    console.error("Delete task database error:", deleteError);

    // Foreign key restriction

    if (deleteError.code === "23503") {
      throw new TaskServiceError(
        409,
        "Cannot delete this task because related records still exist",
      );
    }

    // Permission denied

    if (deleteError.code === "42501") {
      throw new TaskServiceError(
        403,
        "You are not allowed to delete this task",
      );
    }

    throw new TaskServiceError(500, "Failed to delete task");
  }

  // ----------------------------------------
  // 6. CHECK DELETION RESULT
  // ----------------------------------------

  if (!deletedTask) {
    throw new TaskServiceError(403, "You are not allowed to delete this task");
  }

  // ----------------------------------------
  // 7. RETURN DELETED TASK ID
  // ----------------------------------------

  return {
    id: deletedTask.id,
    workspace_id: taskReference.workspace_id,
  };
}

// ==========================================
// GET TASK COMMENTS
// ==========================================

export async function getTaskComments(
  supabase: SupabaseClient,

  taskId: string,
) {
  // ----------------------------------------
  // 1. GET TASK AND WORKSPACE ID
  // ----------------------------------------

  const { data: taskReference, error: referenceError } = await supabase

    .from("tasks")

    .select("id, workspace_id")

    .eq("id", taskId)

    .maybeSingle();

  if (referenceError) {
    console.error("Get task reference error:", referenceError);

    throw new TaskServiceError(500, "Failed to retrieve task");
  }

  if (!taskReference) {
    throw new TaskServiceError(404, "Task not found or inaccessible");
  }

  // ----------------------------------------
  // 2. VERIFY WORKSPACE MEMBERSHIP
  // ----------------------------------------

  await verifyWorkspaceMembership(supabase, taskReference.workspace_id);

  // ----------------------------------------
  // 3. GET TASK COMMENTS
  // ----------------------------------------

  const { data: comments, error: commentsError } = await supabase

    .from("task_comments")

    .select("*")

    .eq("task_id", taskId)

    .eq("workspace_id", taskReference.workspace_id)

    .order("created_at", {
      ascending: true,
    });

  if (commentsError) {
    console.error("Get task comments error:", commentsError);

    throw new TaskServiceError(500, "Failed to retrieve task comments");
  }

  // ----------------------------------------
  // 4. HANDLE EMPTY COMMENTS
  // ----------------------------------------

  if (!comments || comments.length === 0) {
    return {
      comments: [],
      total: 0,
    };
  }

  // ----------------------------------------
  // 5. GET COMMENT AUTHORS
  // ----------------------------------------

  const authorIds = [...new Set(comments.map((comment) => comment.user_id))];

  const { data: authors, error: authorsError } = await supabase

    .from("profiles")

    .select(
      `
      id,
      full_name,
      username,
      avatar_url
    `,
    )

    .in("id", authorIds);

  if (authorsError) {
    console.error("Get comment authors error:", authorsError);

    throw new TaskServiceError(500, "Failed to retrieve comment authors");
  }

  // ----------------------------------------
  // 6. MAP AUTHORS TO COMMENTS
  // ----------------------------------------

  const authorsMap = new Map(
    (authors ?? []).map((author) => [author.id, author]),
  );

  const commentsWithAuthors = comments.map((comment) => ({
    ...comment,

    author: authorsMap.get(comment.user_id) ?? null,
  }));

  // ----------------------------------------
  // 7. RETURN RESULTS
  // ----------------------------------------

  return {
    comments: commentsWithAuthors,

    total: commentsWithAuthors.length,
  };
}

// ==========================================
// CREATE TASK COMMENT
// ==========================================

export async function createTaskComment(
  supabase: SupabaseClient,

  taskId: string,

  userId: string,

  input: CreateTaskCommentInput,
) {
  // ----------------------------------------
  // 1. VERIFY TASK EXISTS
  // ----------------------------------------

  const { data: task, error: taskError } = await supabase

    .from("tasks")

    .select("id, workspace_id")

    .eq("id", taskId)

    .maybeSingle();

  if (taskError) {
    console.error("Get task error:", taskError);

    throw new TaskServiceError(500, "Failed to retrieve task");
  }

  if (!task) {
    throw new TaskServiceError(404, "Task not found or inaccessible");
  }

  // ----------------------------------------
  // 2. VERIFY WORKSPACE MEMBERSHIP
  // ----------------------------------------

  await verifyWorkspaceMembership(supabase, task.workspace_id);

  // ----------------------------------------
  // 3. PREPARE COMMENT DATA
  // ----------------------------------------

  const commentData = {
    task_id: taskId,

    workspace_id: task.workspace_id,

    user_id: userId,

    content: input.content,
  };

  // ----------------------------------------
  // 4. INSERT COMMENT
  // ----------------------------------------

  const { data: comment, error: commentError } = await supabase

    .from("task_comments")

    .insert(commentData)

    .select("*")

    .single();

  // ----------------------------------------
  // 5. HANDLE DATABASE ERRORS
  // ----------------------------------------

  if (commentError) {
    console.error("Create comment error:", commentError);

    if (commentError.code === "42501") {
      throw new TaskServiceError(
        403,
        "You are not allowed to create comments on this task",
      );
    }

    if (commentError.code === "23503") {
      throw new TaskServiceError(400, "Invalid task or user reference");
    }

    if (commentError.code === "23514" || commentError.code === "P0001") {
      throw new TaskServiceError(400, "Invalid comment data");
    }

    throw new TaskServiceError(500, "Failed to create task comment");
  }

  // ----------------------------------------
  // 6. GET COMMENT AUTHOR
  // ----------------------------------------

  const { data: author, error: authorError } = await supabase

    .from("profiles")

    .select(
      `
      id,
      full_name,
      username,
      avatar_url
    `,
    )

    .eq("id", userId)

    .maybeSingle();

  if (authorError) {
    console.error("Get comment author error:", authorError);

    throw new TaskServiceError(
      500,
      "Comment created but failed to retrieve author information",
    );
  }

  // ----------------------------------------
  // 7. RETURN CREATED COMMENT
  // ----------------------------------------

  return {
    ...comment,

    author,
  };
}

// ==========================================
// UPDATE TASK COMMENT
// ==========================================

export async function updateTaskComment(
  supabase: SupabaseClient,

  taskId: string,

  commentId: string,

  userId: string,

  input: UpdateTaskCommentInput,
) {
  // ----------------------------------------
  // 1. GET COMMENT
  // ----------------------------------------

  const { data: comment, error: commentError } = await supabase

    .from("task_comments")

    .select("id, task_id, workspace_id, user_id")

    .eq("id", commentId)

    .eq("task_id", taskId)

    .maybeSingle();

  if (commentError) {
    console.error("Get comment error:", commentError);

    throw new TaskServiceError(500, "Failed to retrieve comment");
  }

  if (!comment) {
    throw new TaskServiceError(404, "Comment not found or inaccessible");
  }

  // ----------------------------------------
  // 2. VERIFY WORKSPACE MEMBERSHIP
  // ----------------------------------------

  await verifyWorkspaceMembership(supabase, comment.workspace_id);

  // ----------------------------------------
  // 3. VERIFY COMMENT PERMISSION
  // ----------------------------------------

  const isAuthor = comment.user_id === userId;

  if (!isAuthor) {
    const { data: isAdmin, error: adminError } = await supabase.rpc(
      "is_workspace_admin",

      {
        target_workspace_id: comment.workspace_id,
      },
    );

    if (adminError) {
      console.error("Admin verification error:", adminError);

      throw new TaskServiceError(500, "Failed to verify comment permissions");
    }

    if (!isAdmin) {
      throw new TaskServiceError(
        403,
        "Only the comment author or workspace Admin can update this comment",
      );
    }
  }

  // ----------------------------------------
  // 4. UPDATE COMMENT
  // ----------------------------------------

  const { data: updatedComment, error: updateError } = await supabase

    .from("task_comments")

    .update({
      content: input.content,
    })

    .eq("id", commentId)

    .eq("task_id", taskId)

    .eq("workspace_id", comment.workspace_id)

    .select("*")

    .maybeSingle();

  // ----------------------------------------
  // 5. HANDLE DATABASE ERRORS
  // ----------------------------------------

  if (updateError) {
    console.error("Update comment error:", updateError);

    if (updateError.code === "42501") {
      throw new TaskServiceError(
        403,
        "You are not allowed to update this comment",
      );
    }

    if (updateError.code === "23514" || updateError.code === "P0001") {
      throw new TaskServiceError(400, "Invalid comment data");
    }

    throw new TaskServiceError(500, "Failed to update task comment");
  }

  if (!updatedComment) {
    throw new TaskServiceError(
      403,
      "You are not allowed to update this comment",
    );
  }

  // ----------------------------------------
  // 6. GET COMMENT AUTHOR
  // ----------------------------------------

  const { data: author, error: authorError } = await supabase

    .from("profiles")

    .select(
      `
      id,
      full_name,
      username,
      avatar_url
    `,
    )

    .eq("id", updatedComment.user_id)

    .maybeSingle();

  if (authorError) {
    console.error("Get updated comment author error:", authorError);

    throw new TaskServiceError(
      500,
      "Comment updated but failed to retrieve author information",
    );
  }

  // ----------------------------------------
  // 7. RETURN UPDATED COMMENT
  // ----------------------------------------

  return {
    ...updatedComment,

    author,
  };
}

// ==========================================
// DELETE TASK COMMENT
// ==========================================

export async function deleteTaskComment(
  supabase: SupabaseClient,

  taskId: string,

  commentId: string,

  userId: string,
) {
  // ----------------------------------------
  // 1. GET COMMENT
  // ----------------------------------------

  const { data: comment, error: commentError } = await supabase

    .from("task_comments")

    .select("id, task_id, workspace_id, user_id")

    .eq("id", commentId)

    .eq("task_id", taskId)

    .maybeSingle();

  if (commentError) {
    console.error("Get comment error:", commentError);

    throw new TaskServiceError(500, "Failed to retrieve comment");
  }

  if (!comment) {
    throw new TaskServiceError(404, "Comment not found or inaccessible");
  }

  // ----------------------------------------
  // 2. VERIFY WORKSPACE MEMBERSHIP
  // ----------------------------------------

  await verifyWorkspaceMembership(supabase, comment.workspace_id);

  // ----------------------------------------
  // 3. VERIFY DELETE PERMISSION
  // ----------------------------------------

  const isAuthor = comment.user_id === userId;

  if (!isAuthor) {
    const { data: isAdmin, error: adminError } = await supabase.rpc(
      "is_workspace_admin",

      {
        target_workspace_id: comment.workspace_id,
      },
    );

    if (adminError) {
      console.error("Admin verification error:", adminError);

      throw new TaskServiceError(500, "Failed to verify comment permissions");
    }

    if (!isAdmin) {
      throw new TaskServiceError(
        403,
        "Only the comment author or workspace Admin can delete this comment",
      );
    }
  }

  // ----------------------------------------
  // 4. DELETE COMMENT
  // ----------------------------------------

  const { data: deletedComment, error: deleteError } = await supabase

    .from("task_comments")

    .delete()

    .eq("id", commentId)

    .eq("task_id", taskId)

    .eq("workspace_id", comment.workspace_id)

    .select("id")

    .maybeSingle();

  // ----------------------------------------
  // 5. HANDLE DATABASE ERRORS
  // ----------------------------------------

  if (deleteError) {
    console.error("Delete comment error:", deleteError);

    if (deleteError.code === "42501") {
      throw new TaskServiceError(
        403,
        "You are not allowed to delete this comment",
      );
    }

    if (deleteError.code === "23503") {
      throw new TaskServiceError(
        409,
        "Cannot delete this comment because related records exist",
      );
    }

    throw new TaskServiceError(500, "Failed to delete task comment");
  }

  if (!deletedComment) {
    throw new TaskServiceError(
      403,
      "You are not allowed to delete this comment",
    );
  }

  // ----------------------------------------
  // 6. RETURN DELETED COMMENT
  // ----------------------------------------

  return {
    id: deletedComment.id,

    task_id: taskId,

    workspace_id: comment.workspace_id,
  };
}
