import { Router } from "express";

import { authenticate } from "../../middlewares/auth.middleware.js";

import { validate } from "../../middlewares/validate.middleware.js";

import {
  getWorkspaceTasksSchema,
  createTaskSchema,
} from "./task.validation.js";

import {
  getWorkspaceTasksController,
  createTaskController,
} from "./task.controller.js";

const router = Router();

// ==========================================
// GET + POST WORKSPACE TASKS
// ==========================================

/**
 * @openapi
 * /api/workspaces/{id}/tasks:
 *
 *   get:
 *     tags:
 *       - Tasks
 *     summary: Get workspace tasks
 *     description: Retrieve workspace tasks with filters, search, sorting and pagination.
 *     security:
 *       - bearerAuth: []
 *
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
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
 *       400:
 *         description: Invalid request parameters.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Not a workspace member.
 *       500:
 *         description: Internal server error.
 *
 *   post:
 *     tags:
 *       - Tasks
 *     summary: Create workspace task
 *     description: Create a task in a workspace. The creator is identified from the verified JWT.
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
 *             required:
 *               - title
 *             properties:
 *               title:
 *                 type: string
 *                 example: Implement Login API
 *               description:
 *                 type: string
 *                 nullable: true
 *                 example: Develop the authentication endpoint
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
 *             description: Develop the authentication endpoint
 *             status: todo
 *             priority: high
 *             assignee_id: null
 *             due_date: '2026-12-01'
 *
 *     responses:
 *       201:
 *         description: Task created successfully.
 *       400:
 *         description: Invalid task data or assignee.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: User is not a workspace member or cannot create tasks.
 *       404:
 *         description: Workspace not found.
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

export default router;
