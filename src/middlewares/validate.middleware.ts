import type { RequestHandler } from "express";
import type { ZodType } from "zod";

export function validate(schema: ZodType): RequestHandler {
  return (req, res, next) => {
    // Validate request parameters, query and body
    const result = schema.safeParse({
      params: req.params,
      query: req.query,
      body: req.body,
    });

    // Return validation errors
    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: "Validation failed",

        errors: result.error.issues.map((issue) => ({
          field: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    // Store validated and parsed data
    res.locals.validated = result.data;

    next();
  };
}
