import { z } from "zod";

// ==========================================
// COMMON VALIDATION
// ==========================================

const uuidSchema = z.string().uuid();

const taskStatusSchema = z.enum(["todo", "in_progress", "in_review", "done"]);

const taskPrioritySchema = z.enum(["low", "medium", "high"]);

// ==========================================
// DATE VALIDATION
// ==========================================

const dateSchema = z.string().refine((value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00.000Z`);

  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}, "Invalid date. Expected YYYY-MM-DD");

// ==========================================
// GET WORKSPACE TASKS VALIDATION
// ==========================================

export const getWorkspaceTasksSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),

  query: z
    .object({
      status: taskStatusSchema.optional(),

      priority: taskPrioritySchema.optional(),

      search: z
        .string()
        .trim()
        .min(1)
        .max(100, "Search cannot exceed 100 characters")
        .optional(),

      sortOrder: z.enum(["asc", "desc"]).default("desc"),

      page: z.coerce.number().int().min(1).default(1),

      limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict(),
});

// ==========================================
// CREATE TASK VALIDATION
// ==========================================

export const createTaskSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),

  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(1, "Task title is required")
        .max(200, "Task title cannot exceed 200 characters"),

      description: z.string().trim().max(5000).nullable().optional(),

      status: taskStatusSchema.optional(),

      priority: taskPrioritySchema.optional(),

      assignee_id: uuidSchema.nullable().optional(),

      due_date: dateSchema.nullable().optional(),
    })
    .strict(),
});

// ==========================================
// GET TASK DETAILS VALIDATION
// ==========================================

export const getTaskDetailsSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),
});

// ==========================================
// UPDATE TASK VALIDATION
// ==========================================

export const updateTaskSchema = z.object({
  params: z.object({
    id: uuidSchema,
  }),

  body: z
    .object({
      title: z
        .string()
        .trim()
        .min(1, "Task title cannot be empty")
        .max(200)
        .optional(),

      description: z.string().trim().max(5000).nullable().optional(),

      status: taskStatusSchema.optional(),

      priority: taskPrioritySchema.optional(),

      assignee_id: uuidSchema.nullable().optional(),

      due_date: dateSchema.nullable().optional(),
    })
    .strict()
    .refine((data) => Object.keys(data).length > 0, {
      message: "At least one field must be provided",
    }),
});

// ==========================================
// EXPORTED TYPES
// ==========================================

export type GetWorkspaceTasksQuery = z.infer<
  typeof getWorkspaceTasksSchema
>["query"];

export type CreateTaskInput = z.infer<typeof createTaskSchema>["body"];

export type GetTaskDetailsParams = z.infer<
  typeof getTaskDetailsSchema
>["params"];

export type UpdateTaskInput = z.infer<typeof updateTaskSchema>["body"];
