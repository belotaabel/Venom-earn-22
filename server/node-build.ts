import path from "node:path";
import { createServer } from "./index";
import * as express from "express";

const app = createServer();
const port = process.env.PORT || 3000;

// In production, serve the built SPA files
const __dirname = import.meta.dirname;
const distPath = path.join(__dirname, "../spa");

// Serve static files
app.use(express.static(distPath));

// Handle React Router - serve index.html for all non-API routes
app.get("/{*splat}", (req, res) => {
  // Don't serve index.html for API routes
  if (req.path.startsWith("/api/") || req.path.startsWith("/health")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  res.sendFile(path.join(distPath, "index.html"));
});

app.listen(port, () => {
  console.log(`🚀 Fusion Starter server running on port ${port}`);
  console.log(`📱 Frontend: http://localhost:${port}`);
  console.log(`🔧 API: http://localhost:${port}/api`);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  const publicUrl = process.env.PUBLIC_APP_URL ?? process.env.MINI_APP_URL;
  if (!token || !publicUrl) return;

  const webhookUrl = `${publicUrl.replace(/\/+$/, "")}/api/telegram/webhook`;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;
  void fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, ...(secretToken ? { secret_token: secretToken } : {}) }),
  })
    .then(async (response) => {
      if (!response.ok) console.error("Telegram webhook registration failed", await response.text());
      else console.log(`Telegram webhook registered at ${webhookUrl}`);
    })
    .catch((error) => console.error("Telegram webhook registration failed", error));
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 Received SIGTERM, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 Received SIGINT, shutting down gracefully");
  process.exit(0);
});
