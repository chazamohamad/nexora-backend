import express from "express";
import cors from "cors";
import swaggerUi from "swagger-ui-express";
import swaggerSpec from "./config/swagger.js";
import authRoutes from "./routes/auth.routes.js";
import taskRoutes from "./modules/tasks/task.routes.js";

const app = express();

// CORS Configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

// Parse JSON Requests
app.use(express.json()); //aya req mn l frontend bthawlu la format JSON la e2dr estaamel req.body/req.params..

// Swagger API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Swagger JSON Specification
app.get("/api-docs.json", (_req, res) => {
  res.status(200).json(swaggerSpec);
});

// Authentication Routes
app.use("/api/auth", authRoutes);

// Task Management Routes
app.use("/api", taskRoutes);

// Health Check API
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "NEXORA API is running",
  });
});

export default app;
