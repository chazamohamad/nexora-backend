import type { Request, Response } from "express";
import { loginWithSupabase } from "../services/auth.service.js";

export async function login(req: Request, res: Response) {
  const body = req.body as {
    email?: unknown;
    password?: unknown;
  };

  const { email, password } = body;

  // Validate required fields
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email.trim() ||
    !password
  ) {
    return res.status(400).json({
      success: false,
      message: "Email and password are required",
    });
  }

  // Basic email validation
  const normalizedEmail = email.trim();

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return res.status(400).json({
      success: false,
      message: "Please enter a valid email address",
    });
  }

  try {
    const { user, session } = await loginWithSupabase(
      normalizedEmail,
      password,
    );

    return res.status(200).json({
      success: true,
      message: "Login successful",

      data: {
        user,

        session: {
          accessToken: session.access_token,
          refreshToken: session.refresh_token,
          tokenType: session.token_type,
          expiresIn: session.expires_in,
          expiresAt: session.expires_at,
        },
      },
    });
  } catch (error) {
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof error.status === "number"
        ? error.status
        : undefined;

    if (status === 400 || status === 401) {
      return res.status(401).json({
        success: false,
        message: "Invalid email or password",
      });
    }

    if (status === 429) {
      return res.status(429).json({
        success: false,
        message: "Too many login attempts. Please try again later.",
      });
    }

    console.error("Supabase login error:", error);

    return res.status(502).json({
      success: false,
      message: "Authentication service is temporarily unavailable",
    });
  }
}
