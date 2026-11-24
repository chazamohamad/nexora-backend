import type { RequestHandler } from "express"; //type jehez mn express la 3aref middleware

import { verifyCredentials } from "@supabase/server/core";

import { createSupabaseUserClient } from "../config/supabase.js";

// ==========================================
// JWT AUTHENTICATION MIDDLEWARE
// ==========================================

export const authenticate: RequestHandler = async (req, res, next) => {
  // 1. Read Authorization Header

  const authHeader = req.headers.authorization; //l http header bikun fi: Authorization: Bearer eyJhbGciOi...

  // 2. Extract Bearer Token

  const match = authHeader?.match(/^Bearer\s+(.+)$/i);

  const token = match?.[1]?.trim();

  // 3. Check if Token Exists

  if (!token) {
    res.status(401).json({
      success: false,
      message: "Access token is required",
    });

    return;
  }

  try {
    // 4. Verify JWT Token

    const { data: auth, error } = await verifyCredentials(
      {
        token,
        apikey: req.get("apikey") ?? null,
      },

      {
        auth: "user", //bisir li bl supabbase by3rf l user mn l token w y3rf l claims w y3rf l keyName/نحدد أن سياق المصادقة المطلوب هو مصادقة مستخدم
      },
    );

    // 5. Reject Invalid Tokens

    if (error || !auth?.token || !auth.userClaims?.id) {
      const statusCode = error?.status ?? 401;

      res.status(statusCode).json({
        success: false,
        message:
          statusCode === 401
            ? "Invalid or expired access token"
            : "Authentication verification failed",
      });

      return;
    }

    // 6. Extract Authenticated User Information

    req.user = {
      id: auth.userClaims.id,

      email: auth.userClaims.email ?? null,
    };

    // 7. Create User-Scoped Supabase Client

    req.supabase = createSupabaseUserClient(auth.token, auth.keyName);

    // 8. Continue to the Next Middleware / Controller

    next();
  } catch (error) {
    console.error("Authentication middleware error:", error);

    res.status(500).json({
      success: false,
      message: "Authentication service is temporarily unavailable",
    });
  }
};
