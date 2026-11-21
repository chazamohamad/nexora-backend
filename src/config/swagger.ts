import swaggerJsdoc from "swagger-jsdoc";
import type { Options } from "swagger-jsdoc";

const options: Options = {
  definition: {
    openapi: "3.0.3",

    info: {
      title: "NEXORA API",
      version: "1.0.0",
      description: "NEXORA Backend API Documentation",
    },

    servers: [
      {
        url: `http://localhost:${process.env.PORT || 5000}`,
        description: "Local Development Server",
      },
    ],

    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
          description: "Enter your Supabase Access Token",
        },
      },

      schemas: {
        ApiError: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Validation failed",
            },
          },
        },

        Task: {
          type: "object",
          properties: {
            id: {
              type: "string",
              format: "uuid",
            },
            workspace_id: {
              type: "string",
              format: "uuid",
            },
            title: {
              type: "string",
              example: "Implement Login API",
            },
            description: {
              type: "string",
              nullable: true,
            },
            status: {
              type: "string",
              enum: ["todo", "in_progress", "in_review", "done"],
            },
            priority: {
              type: "string",
              enum: ["low", "medium", "high"],
            },
            assignee_id: {
              type: "string",
              format: "uuid",
              nullable: true,
            },
            created_by: {
              type: "string",
              format: "uuid",
            },
            due_date: {
              type: "string",
              format: "date",
              nullable: true,
            },
            completed_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            updated_at: {
              type: "string",
              format: "date-time",
            },
          },
        },
      },
    },
  },

  // Swagger reads documentation comments from these files.
  apis: ["./src/modules/**/*.ts"],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
