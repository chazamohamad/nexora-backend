import type { RequestHandler } from "express";

import {
  getWorkspaceTasks,
  createWorkspaceTask,
  getTaskDetails,
  updateTask,
  deleteTask,
  getTaskComments,
  createTaskComment,
  updateTaskComment,
  deleteTaskComment,
  TaskServiceError,
} from "./task.service.js";

import type {
  GetWorkspaceTasksQuery,
  CreateTaskInput,
  GetTaskDetailsParams,
  UpdateTaskInput,
  DeleteTaskParams,
  GetTaskCommentsParams,
  CreateTaskCommentInput,
  UpdateTaskCommentInput,
  CreateTaskCommentParams,
  UpdateTaskCommentParams,
  DeleteTaskCommentParams,
} from "./task.validation.js";

// ==========================================
// VALIDATED REQUEST TYPES
// ==========================================

type ValidatedGetWorkspaceTasks = {
  params: {
    id: string;
  };

  query: GetWorkspaceTasksQuery;
};

type ValidatedCreateTask = {
  params: {
    id: string;
  };

  body: CreateTaskInput;
};

type ValidatedGetTaskDetails = {
  params: GetTaskDetailsParams;
};

type ValidatedUpdateTask = {
  params: {
    id: string;
  };

  body: UpdateTaskInput;
};

// ==========================================
// GET WORKSPACE TASKS CONTROLLER
// ==========================================

export const getWorkspaceTasksController: RequestHandler = async (req, res) => {
  // 1. Verify authenticated user and Supabase client

  const user = req.user;
  const supabase = req.supabase;

  if (!user || !supabase) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

    return;
  }

  try {
    // 2. Get validated request data

    const validated = res.locals.validated as ValidatedGetWorkspaceTasks;

    const workspaceId = validated.params.id;
    const filters = validated.query;

    // 3. Call service

    const result = await getWorkspaceTasks(supabase, workspaceId, filters);

    // 4. Return successful response

    res.status(200).json({
      success: true,
      message: "Tasks retrieved successfully",
      data: result,
    });
  } catch (error) {
    // 5. Handle known service errors

    if (error instanceof TaskServiceError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });

      return;
    }

    // 6. Handle unexpected errors

    console.error("Get tasks controller error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ==========================================
// CREATE TASK CONTROLLER
// ==========================================

export const createTaskController: RequestHandler = async (req, res) => {
  // 1. Verify authenticated user and Supabase client

  const user = req.user;
  const supabase = req.supabase;

  if (!user || !supabase) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

    return;
  }

  try {
    // 2. Get validated request data

    const validated = res.locals.validated as ValidatedCreateTask;

    const workspaceId = validated.params.id;

    // User ID comes from the verified JWT

    const userId = user.id;

    const taskInput = validated.body;

    // 3. Call service

    const task = await createWorkspaceTask(
      supabase,
      workspaceId,
      userId,
      taskInput,
    );

    // 4. Return successful response

    res.status(201).json({
      success: true,
      message: "Task created successfully",
      data: {
        task,
      },
    });
  } catch (error) {
    // 5. Handle known service errors

    if (error instanceof TaskServiceError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });

      return;
    }

    // 6. Handle unexpected errors

    console.error("Create task controller error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ==========================================
// GET TASK DETAILS CONTROLLER
// ==========================================

export const getTaskDetailsController: RequestHandler = async (req, res) => {
  // 1. Verify authenticated user and Supabase client

  const user = req.user;
  const supabase = req.supabase;

  if (!user || !supabase) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

    return;
  }

  try {
    // 2. Get validated request parameters

    const validated = res.locals.validated as ValidatedGetTaskDetails;

    const taskId = validated.params.id;

    // 3. Call service

    const task = await getTaskDetails(supabase, taskId);

    // 4. Return successful response

    res.status(200).json({
      success: true,
      message: "Task retrieved successfully",
      data: {
        task,
      },
    });
  } catch (error) {
    // 5. Handle known service errors

    if (error instanceof TaskServiceError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });

      return;
    }

    // 6. Handle unexpected errors

    console.error("Get task details controller error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ==========================================
// UPDATE TASK CONTROLLER
// ==========================================

export const updateTaskController: RequestHandler = async (req, res) => {
  // 1. Verify authenticated user and Supabase client

  const user = req.user;
  const supabase = req.supabase;

  if (!user || !supabase) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

    return;
  }

  try {
    // 2. Get validated request data

    const validated = res.locals.validated as ValidatedUpdateTask;

    const taskId = validated.params.id;
    const taskInput = validated.body;

    // 3. Call service

    const task = await updateTask(supabase, taskId, taskInput);

    // 4. Return successful response

    res.status(200).json({
      success: true,
      message: "Task updated successfully",
      data: {
        task,
      },
    });
  } catch (error) {
    // 5. Handle known service errors

    if (error instanceof TaskServiceError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });

      return;
    }

    // 6. Handle unexpected errors

    console.error("Update task controller error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ==========================================
// DELETE TASK CONTROLLER
// ==========================================

export const deleteTaskController: RequestHandler = async (req, res) => {
  // 1. Verify authenticated user and Supabase client

  const user = req.user;
  const supabase = req.supabase;

  if (!user || !supabase) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

    return;
  }

  try {
    // 2. Get validated request parameters

    const validated = res.locals.validated as {
      params: DeleteTaskParams;
    };

    const taskId = validated.params.id;

    // 3. Call service

    const deletedTask = await deleteTask(supabase, taskId);

    // 4. Return successful response

    res.status(200).json({
      success: true,
      message: "Task deleted successfully",
      data: {
        task: deletedTask,
      },
    });
  } catch (error) {
    // 5. Handle known service errors

    if (error instanceof TaskServiceError) {
      res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });

      return;
    }

    // 6. Handle unexpected errors

    console.error("Delete task controller error:", error);

    res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

// ==========================================
// GET TASK COMMENTS CONTROLLER
// ==========================================

export const getTaskCommentsController: RequestHandler = async (req, res) => {
  // 1. Verify authenticated user and Supabase client

  const user = req.user;
  const supabase = req.supabase;

  if (!user || !supabase) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

    return;
  }

  try {
    // 2. Get validated request parameters

    const validated = res.locals.validated as {
      params: GetTaskCommentsParams;
    };

    const taskId = validated.params.id;

    // 3. Call service

    const result = await getTaskComments(supabase, taskId);

    // 4. Return successful response

    res.status(200).json({
      success: true,

      message: "Task comments retrieved successfully",

      data: result,
    });
  } catch (error) {
    // 5. Handle known service errors

    if (error instanceof TaskServiceError) {
      res.status(error.statusCode).json({
        success: false,

        message: error.message,
      });

      return;
    }

    // 6. Handle unexpected errors

    console.error("Get task comments controller error:", error);

    res.status(500).json({
      success: false,

      message: "Internal server error",
    });
  }
};

// ==========================================
// POST TASK COMMENT CONTROLLER
// ==========================================

export const createTaskCommentController: RequestHandler = async (req, res) => {
  const user = req.user;
  const supabase = req.supabase;

  if (!user || !supabase) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

    return;
  }

  try {
    // 1. Get validated data

    const validated = res.locals.validated as {
      params: CreateTaskCommentParams;

      body: CreateTaskCommentInput;
    };

    // 2. Call service

    const comment = await createTaskComment(
      supabase,

      validated.params.id,

      user.id,

      validated.body,
    );

    // 3. Return response

    res.status(201).json({
      success: true,

      message: "Comment created successfully",

      data: {
        comment,
      },
    });
  } catch (error) {
    if (error instanceof TaskServiceError) {
      res.status(error.statusCode).json({
        success: false,

        message: error.message,
      });

      return;
    }

    console.error("Create comment controller error:", error);

    res.status(500).json({
      success: false,

      message: "Internal server error",
    });
  }
};

// ==========================================
// PATCH TASK COMMENT CONTROLLER
// ==========================================

export const updateTaskCommentController: RequestHandler = async (req, res) => {
  const user = req.user;
  const supabase = req.supabase;

  if (!user || !supabase) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

    return;
  }

  try {
    // 1. Get validated data

    const validated = res.locals.validated as {
      params: UpdateTaskCommentParams;

      body: UpdateTaskCommentInput;
    };

    // 2. Call service

    const comment = await updateTaskComment(
      supabase,

      validated.params.id,

      validated.params.commentId,

      user.id,

      validated.body,
    );

    // 3. Return response

    res.status(200).json({
      success: true,

      message: "Comment updated successfully",

      data: {
        comment,
      },
    });
  } catch (error) {
    if (error instanceof TaskServiceError) {
      res.status(error.statusCode).json({
        success: false,

        message: error.message,
      });

      return;
    }

    console.error("Update comment controller error:", error);

    res.status(500).json({
      success: false,

      message: "Internal server error",
    });
  }
};

// ==========================================
// DELETE TASK COMMENT CONTROLLER
// ==========================================

export const deleteTaskCommentController: RequestHandler = async (req, res) => {
  const user = req.user;
  const supabase = req.supabase;

  if (!user || !supabase) {
    res.status(401).json({
      success: false,
      message: "Unauthorized",
    });

    return;
  }

  try {
    // 1. Get validated data

    const validated = res.locals.validated as {
      params: DeleteTaskCommentParams;
    };

    // 2. Call service

    const result = await deleteTaskComment(
      supabase,

      validated.params.id,

      validated.params.commentId,

      user.id,
    );

    // 3. Return response

    res.status(200).json({
      success: true,

      message: "Comment deleted successfully",

      data: {
        comment: result,
      },
    });
  } catch (error) {
    if (error instanceof TaskServiceError) {
      res.status(error.statusCode).json({
        success: false,

        message: error.message,
      });

      return;
    }

    console.error("Delete comment controller error:", error);

    res.status(500).json({
      success: false,

      message: "Internal server error",
    });
  }
};
