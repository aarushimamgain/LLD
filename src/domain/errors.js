export class DomainError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

/** Input the learner (or an author) can fix. `details` holds one human-readable line per problem. */
export class ValidationError extends DomainError {
  constructor(message, details = []) {
    super(message);
    this.details = details;
  }
}

export class NotFoundError extends DomainError {}

/** The request is valid but clashes with the current state (e.g. editing a submitted attempt). */
export class ConflictError extends DomainError {}

export class InvalidTransitionError extends ConflictError {
  constructor(from, to) {
    super(`Cannot move attempt from ${from} to ${to}`);
    this.from = from;
    this.to = to;
  }
}
