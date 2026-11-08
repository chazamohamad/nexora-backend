import "dotenv/config";

import app from "./app.js";
import { validateSupabaseConfig } from "./config/supabase.js";

// Validate Supabase configuration
const supabaseUrl = validateSupabaseConfig();

console.log("Supabase configuration loaded successfully.");
console.log(`Connected Project: ${new URL(supabaseUrl).host}`);

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`TeamFlow Backend is running on http://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/api/health`);
});
