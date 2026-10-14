import { createApp } from './app.js';

// Entry point: the only place that reads process.env. Wiring lives in app.js.
try {
  process.loadEnvFile();
} catch {
  // No .env file: run with defaults (in-memory repo, mock LLM).
}

const { app, service, llmClient } = await createApp({ env: process.env });

// Attempts left EVALUATING by a previous crash would otherwise spin forever in the UI.
const recovered = await service.recoverStuckEvaluations();
if (recovered > 0) console.warn(`[startup] marked ${recovered} interrupted evaluation(s) as FAILED (retryable)`);

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => {
  console.log(`LLD Practice Platform running on http://localhost:${port} (AI reviewer: ${llmClient.name})`);
});
