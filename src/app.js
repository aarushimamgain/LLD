import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apiNotFound, createErrorHandler } from './api/error-handler.js';
import { createApiRouter } from './api/routes.js';
import { DEFAULT_TIMEOUT_MS } from './evaluation/composite-evaluator.js';
import { createEvaluator } from './evaluation/create-evaluator.js';
import { createLLMClient } from './llm/create-llm-client.js';
import { StructuredJsonParser } from './parsers/structured-json-parser.js';
import { createAttemptRepository } from './repositories/create-attempt-repository.js';
import { ProblemCatalog } from './repositories/problem-catalog.js';
import { PracticeService } from './services/practice-service.js';

const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

/**
 * Composition root: builds every dependency from `env` unless it is passed in, so tests can
 * build the real app with in-memory storage and the mock LLM.
 *
 * @param {object} [options]
 * @param {Record<string, string | undefined>} [options.env] configuration (server.js passes process.env)
 * @param {{warn: Function, error: Function}} [options.logger]
 * @param {import('./repositories/attempt-repository.js').AttemptRepository} [options.attemptRepository]
 * @param {ProblemCatalog} [options.problemCatalog]
 * @param {import('./llm/llm-client.js').LLMClient} [options.llmClient]
 * @param {import('./evaluation/evaluator.js').Evaluator} [options.evaluator]
 * @param {import('./parsers/submission-parser.js').SubmissionParser} [options.parser]
 */
export async function createApp({
  env = {},
  logger = console,
  attemptRepository = createAttemptRepository(env, logger),
  problemCatalog,
  llmClient = createLLMClient(env, logger),
  evaluator = createEvaluator({ llmClient, timeoutMs: Number(env.EVAL_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS, logger }),
  parser = new StructuredJsonParser(),
} = {}) {
  const service = new PracticeService({
    attemptRepository,
    problemCatalog: problemCatalog ?? await ProblemCatalog.fromDirectory(),
    evaluator,
    parser,
    logger,
  });

  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(publicDir));
  app.use('/api', createApiRouter(service));
  app.use('/api', apiNotFound);
  app.use(createErrorHandler(logger));

  return { app, service, llmClient };
}
