import type { SupabaseClient } from "@supabase/supabase-js";

import type { GetWorkspaceTasksQuery } from "./task.validation.js";

import type { CreateTaskInput } from "./task.validation.js";

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
// GET WORKSPACE TASKS
// ==========================================

export async function getWorkspaceTasks(
  supabase: SupabaseClient,

  workspaceId: string,

  filters: GetWorkspaceTasksQuery,
) {
  // ----------------------------------------
  // 1. VERIFY WORKSPACE MEMBERSHIP
  // ----------------------------------------

  const { data: isMember, error: membershipError } = await supabase.rpc(
    "is_active_workspace_member",
    {
      target_workspace_id: workspaceId,
    },
  );

  if (membershipError) {
    console.error("Workspace membership check failed:", membershipError);

    throw new TaskServiceError(500, "Failed to verify workspace membership");
  }

  if (!isMember) {
    throw new TaskServiceError(403, "You are not a member of this workspace");
  }

  // ----------------------------------------
  // 2. INITIALIZE TASK QUERY
  // ----------------------------------------

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

  // ----------------------------------------
  // 3. FILTER BY STATUS
  // ----------------------------------------

  if (filters.status) {
    query = query.eq("status", filters.status);
  }

  // ----------------------------------------
  // 4. FILTER BY PRIORITY
  // ----------------------------------------

  if (filters.priority) {
    query = query.eq("priority", filters.priority);
  }

  // ----------------------------------------
  // 5. SEARCH IN TITLE AND DESCRIPTION
  // ----------------------------------------

  if (filters.search) {
    const searchTerm = filters.search

      .replace(/\\/g, "\\\\")

      .replace(/"/g, '\\"')

      .replace(/%/g, "\\%")

      .replace(/_/g, "\\_");

    const searchPattern = `"%${searchTerm}%"`;

    query = query.or(
      `title.ilike.${searchPattern},description.ilike.${searchPattern}`,
    );
  }

  // ----------------------------------------
  // 6. SORT BY CREATION DATE
  // ----------------------------------------

  const ascending = filters.sortOrder === "asc";

  query = query

    .order("created_at", {
      ascending,
    })

    .order("id", {
      ascending,
    });

  // ----------------------------------------
  // 7. PAGINATION
  // ----------------------------------------

  const from = (filters.page - 1) * filters.limit;

  const to = from + filters.limit - 1;

  query = query.range(from, to);

  // ----------------------------------------
  // 8. EXECUTE DATABASE QUERY
  // ----------------------------------------

  const { data: tasks, error: tasksError, count } = await query;

  if (tasksError) {
    console.error("Get workspace tasks failed:", tasksError);

    throw new TaskServiceError(500, "Failed to retrieve workspace tasks");
  }

  // ----------------------------------------
  // 9. CALCULATE PAGINATION METADATA
  // ----------------------------------------

  const total = count ?? 0;

  const totalPages = Math.ceil(total / filters.limit);

  // ----------------------------------------
  // 10. RETURN RESULTS
  // ----------------------------------------

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
  // ----------------------------------------
  // 1. VERIFY CURRENT USER MEMBERSHIP
  // ----------------------------------------

  const { data: isMember, error: membershipError } = await supabase.rpc(
    "is_active_workspace_member",
    {
      target_workspace_id: workspaceId,
    },
  );

  if (membershipError) {
    console.error("Membership verification failed:", membershipError);

    throw new TaskServiceError(500, "Failed to verify workspace membership");
  }

  if (!isMember) {
    throw new TaskServiceError(403, "You are not a member of this workspace");
  }

  // ----------------------------------------
  // 2. PREPARE TASK DATA
  // ----------------------------------------

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

  // ----------------------------------------
  // 3. INSERT TASK INTO DATABASE
  // ----------------------------------------

  const { data: task, error: taskError } = await supabase

    .from("tasks")

    .insert(taskData)

    .select("*")

    .single();

  // ----------------------------------------
  // 4. HANDLE DATABASE ERRORS
  // ----------------------------------------

  if (taskError) {
    console.error("Create task database error:", taskError);

    if (taskError.message.includes("Assignee must be a member")) {
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

    throw new TaskServiceError(500, "Failed to create task");
  }

  // ----------------------------------------
  // 5. RETURN CREATED TASK
  // ----------------------------------------

  return task;
}
