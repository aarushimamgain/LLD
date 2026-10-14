import { Router } from 'express';
import { schemas, validate } from './schemas.js';

/**
 * HTTP → service calls. Each handler validates input, calls one service method and shapes the
 * response; errors go to the central error handler (Express 5 forwards async errors).
 * @param {import('../services/practice-service.js').PracticeService} service
 */
export function createApiRouter(service) {
  const router = Router();

  router.get('/health', (req, res) => res.json({ status: 'ok' }));

  router.get('/problems', (req, res) => {
    res.json({ problems: service.listProblems() });
  });

  router.get('/problems/:id', (req, res) => {
    res.json({ problem: service.getProblem(req.params.id) });
  });

  router.get('/problems/:id/sample', (req, res) => {
    res.json({ sample: service.getSample(req.params.id) });
  });

  router.post('/attempts', async (req, res) => {
    const { attempt, created } = await service.startAttempt(validate(schemas.startAttempt, req.body));
    res.status(created ? 201 : 200).json({ attempt: present(attempt) });
  });

  router.put('/attempts/:id', async (req, res) => {
    const attempt = await service.saveDraft(req.params.id, validate(schemas.saveDraft, req.body));
    res.json({ attempt: present(attempt) });
  });

  router.post('/attempts/:id/submit', async (req, res) => {
    const attempt = await service.submit(req.params.id, validate(schemas.submit, req.body));
    res.status(202).json({ attempt: present(attempt) });
  });

  router.post('/attempts/:id/retry', async (req, res) => {
    const attempt = await service.retryEvaluation(req.params.id, validate(schemas.retry, req.body));
    res.status(202).json({ attempt: present(attempt) });
  });

  router.get('/attempts/:id', async (req, res) => {
    const { attempt, comparison, concepts } = await service.getAttempt(req.params.id);
    res.json({ attempt: present(attempt), comparison, concepts });
  });

  router.get('/learners/:learnerId/attempts', async (req, res) => {
    const { learnerId } = validate(schemas.learnerParams, req.params);
    const { problemId } = validate(schemas.historyQuery, req.query);
    res.json(await service.getHistory(learnerId, { problemId }));
  });

  return router;
}

/**
 * Attempt as sent to the browser. The learnerId is the only (weak) ownership check without
 * auth, so it isn't echoed back to anyone who merely knows an attempt id.
 */
function present(attempt) {
  const { learnerId, ...rest } = attempt.toJSON();
  return rest;
}
