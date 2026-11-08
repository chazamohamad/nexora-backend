import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";

const app = express();

// CORS Configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

// Parse JSON Requests
app.use(express.json());

// Authentication Routes
app.use("/api/auth", authRoutes);

// Health Check API
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "NEXORA API is running",
  });
});

export default app;
