import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware.js";

import { validate } from "../../middlewares/validate.middleware.js";

import {
  getWorkspaceTasksSchema,
  createTaskSchema,
  getTaskDetailsSchema,
  updateTaskSchema,
} from "./task.validation.js";

import {
  getWorkspaceTasksController,
  createTaskController,
  getTaskDetailsController,
  updateTaskController,
} from "./task.controller.js";

const router = Router();

// ==========================================
// WORKSPACE TASKS - GET & POST
// ==========================================

/**
 * @openapi
 * /api/workspaces/{id}/tasks:
 *
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get workspace tasks
 *     description: Retrieve workspace tasks with filtering, searching, sorting and pagination.
 *
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Workspace UUID
 *         schema:
 *           type: string
 *           format: uuid
 *
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [todo, in_progress, in_review, done]
 *
 *       - in: query
 *         name: priority
 *         schema:
 *           type: string
 *           enum: [low, medium, high]
 *
 *       - in: query
 *         name: search
 *         description: Search in task title and description.
 *         schema:
 *           type: string
 *
 *       - in: query
 *         name: sortOrder
 *         description: Sort tasks by creation date.
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *
 *     responses:
 *       200:
 *         description: Tasks retrieved successfully.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Tasks retrieved successfully
 *               data:
 *                 tasks: []
 *                 pagination:
 *                   page: 1
 *                   limit: 20
 *                   total: 0
 *                   totalPages: 0
 *                   hasNextPage: false
 *                   hasPreviousPage: false
 *
 *       400:
 *         description: Invalid query parameters.
 *
 *       401:
 *         description: Missing or invalid access token.
 *
 *       403:
 *         description: User is not a workspace member.
 *
 *       500:
 *         description: Internal server error.
 *
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Create workspace task
 *     description: Create a task inside a workspace. The creator is identified from the verified JWT.
 *
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Workspace UUID
 *         schema:
 *           type: string
 *           format: uuid
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: Implement Login API
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: Develop authentication endpoint
 *               status:
 *                 type: string
 *                 enum: [todo, in_progress, in_review, done]
 *                 default: todo
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *                 default: medium
 *               assignee_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               due_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *           example:
 *             title: Implement Login API
 *             description: Develop authentication endpoint
 *             status: todo
 *             priority: high
 *             assignee_id: null
 *             due_date: '2026-12-01'
 *
 *     responses:
 *       201:
 *         description: Task created successfully.
 *
 *       400:
 *         description: Invalid task data or assignee.
 *
 *       401:
 *         description: Missing or invalid access token.
 *
 *       403:
 *         description: User is not authorized to create tasks.
 *
 *       500:
 *         description: Internal server error.
 */

// GET: Retrieve workspace tasks

router.get(
  "/workspaces/:id/tasks",
  authenticate,
  validate(getWorkspaceTasksSchema),
  getWorkspaceTasksController,
);

// POST: Create workspace task

router.post(
  "/workspaces/:id/tasks",
  authenticate,
  validate(createTaskSchema),
  createTaskController,
);

// ==========================================
// TASK DETAILS - GET & PATCH
// ==========================================

/**
 * @openapi
 * /api/tasks/{id}:
 *
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get task details
 *     description: Retrieve task details, including creator and assignee information.
 *
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Task UUID
 *         schema:
 *           type: string
 *           format: uuid
 *
 *     responses:
 *       200:
 *         description: Task retrieved successfully.
 *         content:
 *           application/json:
 *             example:
 *               success: true
 *               message: Task retrieved successfully
 *               data:
 *                 task:
 *                   id: 5ecc5095-4ea5-4c47-8bf9-23ac5d356c59
 *                   title: Implement Login API
 *                   status: in_progress
 *                   priority: high
 *                   assignee_id: null
 *                   created_by: 02d006e5-acc9-44ec-beb4-53d4e99e31f6
 *
 *       400:
 *         description: Invalid task ID.
 *
 *       401:
 *         description: Missing or invalid access token.
 *
 *       403:
 *         description: User is not authorized.
 *
 *       404:
 *         description: Task not found or inaccessible.
 *
 *       500:
 *         description: Internal server error.
 *
 *   patch:
 *     tags:
 *       - Tasks
 *     summary: Update task
 *     description: Update one or more task fields. The workspace and creator cannot be changed.
 *
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: Task UUID
 *         schema:
 *           type: string
 *           format: uuid
 *
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties: false
 *             minProperties: 1
 *             properties:
 *               title:
 *                 type: string
 *                 example: Updated Login API
 *               description:
 *                 type: string
 *                 nullable: true
 *               status:
 *                 type: string
 *                 enum: [todo, in_progress, in_review, done]
 *               priority:
 *                 type: string
 *                 enum: [low, medium, high]
 *               assignee_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *               due_date:
 *                 type: string
 *                 format: date
 *                 nullable: true
 *           examples:
 *             updateStatus:
 *               summary: Update task status
 *               value:
 *                 status: in_progress
 *             updateTask:
 *               summary: Update multiple task fields
 *               value:
 *                 title: Updated Login API
 *                 description: Updated task description
 *                 status: in_review
 *                 priority: medium
 *                 due_date: '2026-12-05'
 *
 *     responses:
 *       200:
 *         description: Task updated successfully.
 *
 *       400:
 *         description: Invalid task data or assignee.
 *
 *       401:
 *         description: Missing or invalid access token.
 *
 *       403:
 *         description: User is not authorized to update this task.
 *
 *       404:
 *         description: Task not found or inaccessible.
 *
 *       500:
 *         description: Internal server error.
 */

// GET: Retrieve task details

router.get(
  "/tasks/:id",
  authenticate,
  validate(getTaskDetailsSchema),
  getTaskDetailsController,
);

// PATCH: Update existing task

router.patch(
  "/tasks/:id",
  authenticate,
  validate(updateTaskSchema),
  updateTaskController,
);

export default router;
