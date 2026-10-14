import { ConflictError, InvalidTransitionError, NotFoundError, ValidationError } from '../domain/errors.js';

/** Unknown /api routes get a JSON 404 instead of Express's HTML page. */
export function apiNotFound(req, res) {
  res.status(404).json({ error: `No API route for ${req.method} ${req.originalUrl}` });
}

/**
 * The one place errors become HTTP responses. Domain errors map to 4xx with their message;
 * anything else is logged with its stack and answered with a generic 500, so internals
 * (stack traces, SQL, provider responses) never reach the client.
 * @param {{error: Function}} logger
 */
export function createErrorHandler(logger) {
  return function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);
    const { status, body } = toResponse(error);
    if (status >= 500) logger.error(`[api] ${req.method} ${req.originalUrl} failed: ${error.stack ?? error}`);
    res.status(status).json(body);
  };
}

function toResponse(error) {
  if (error instanceof ValidationError) return { status: 400, body: { error: error.message, details: error.details } };
  if (error instanceof NotFoundError) return { status: 404, body: { error: error.message } };
  if (error instanceof InvalidTransitionError) {
    return { status: 409, body: { error: `That isn't possible while the attempt is ${error.from}.` } };
  }
  if (error instanceof ConflictError) return { status: 409, body: { error: error.message } };

  // Errors raised by express.json() before our code runs.
  if (error.type === 'entity.parse.failed') return { status: 400, body: { error: 'The request body is not valid JSON.' } };
  if (error.type === 'entity.too.large') return { status: 413, body: { error: 'The request body is too large.' } };

  return { status: 500, body: { error: 'Something went wrong on our side. Please try again.' } };
}
