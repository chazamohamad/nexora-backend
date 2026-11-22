import type { RequestHandler } from "express";

import {
  getWorkspaceTasks,
  createWorkspaceTask,
  getTaskDetails,
  updateTask,
  TaskServiceError,
} from "./task.service.js";

import type {
  GetWorkspaceTasksQuery,
  CreateTaskInput,
  GetTaskDetailsParams,
  UpdateTaskInput,
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
