import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  GetWorkspaceTasksQuery,
  CreateTaskInput,
  UpdateTaskInput,
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
