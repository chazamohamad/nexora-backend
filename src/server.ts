import "dotenv/config";
import app from "./app.js";

const PORT = Number(process.env.PORT) || 5000;

app.listen(PORT, () => {
  console.log(`TeamFlow Backend is running on http://localhost:${PORT}`);
  console.log(`Health Check: http://localhost:${PORT}/api/health`);
});
