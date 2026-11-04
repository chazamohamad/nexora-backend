import express from "express";
import cors from "cors";

const app = express();

// CORS Configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
  }),
);

// Parse JSON Requests
app.use(express.json());

// Health Check API
app.get("/api/health", (_req, res) => {
  res.status(200).json({
    success: true,
    message: "TeamFlow API is running",
  });
});

export default app;
