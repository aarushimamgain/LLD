import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { Difficulty, Dimension } from '../domain/enums.js';
import { NotFoundError } from '../domain/errors.js';
import { Problem } from '../domain/problem.js';

const DEFAULT_PROBLEMS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'problems');

const nonEmpty = z.string().trim().min(1);

const requirementSchema = z.strictObject({
  id: z.string().regex(/^R\d+$/, 'Requirement ids look like "R1"'),
  text: nonEmpty,
  keywords: z.array(nonEmpty).min(1),
});

const conceptSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Concept ids are kebab-case'),
  name: nonEmpty,
  aliases: z.array(nonEmpty).min(1),
  expectAbstraction: z.boolean().default(false),
  requirementIds: z.array(z.string()).default([]),
  suggestedPatterns: z.array(nonEmpty).default([]),
  why: nonEmpty,
});

const weightsSchema = z.strictObject(
  Object.fromEntries(Object.values(Dimension).map((d) => [d, z.number().min(0).optional()])),
);

const problemSchema = z.strictObject({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Problem ids are kebab-case'),
  title: nonEmpty,
  difficulty: z.enum(Object.values(Difficulty)),
  description: nonEmpty,
  requirements: z.array(requirementSchema).min(1),
  constraints: z.array(nonEmpty).default([]),
  clarifyingQuestions: z.array(nonEmpty).default([]),
  rubric: z.strictObject({
    weights: weightsSchema.optional(),
    concepts: z.array(conceptSchema).min(1),
  }),
});

/**
 * Validates one raw problem definition and builds a Problem.
 * Errors are for problem authors, so they name the file and the exact path.
 * @param {unknown} raw
 * @param {string} [source] file name, for error messages
 * @returns {Problem}
 */
export function parseProblemDefinition(raw, source = 'problem definition') {
  const parsed = problemSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid ${source}:\n${z.prettifyError(parsed.error)}`);
  }
  const crossErrors = crossCheck(parsed.data);
  if (crossErrors.length > 0) {
    throw new Error(`Invalid ${source}:\n${crossErrors.map((e) => `  ✖ ${e}`).join('\n')}`);
  }
  return new Problem(parsed.data);
}

/** Checks zod can't express: unique ids and concept → requirement references. */
function crossCheck(data) {
  const errors = [];
  const requirementIds = data.requirements.map((r) => r.id);
  for (const id of findDuplicates(requirementIds)) errors.push(`Duplicate requirement id "${id}"`);
  for (const id of findDuplicates(data.rubric.concepts.map((c) => c.id))) errors.push(`Duplicate concept id "${id}"`);
  for (const concept of data.rubric.concepts) {
    for (const reqId of concept.requirementIds) {
      if (!requirementIds.includes(reqId)) errors.push(`Concept "${concept.id}" references unknown requirement "${reqId}"`);
    }
  }
  return errors;
}

function findDuplicates(values) {
  return [...new Set(values.filter((v, i) => values.indexOf(v) !== i))];
}

/** Read-only set of problems (and their demo sample designs), loaded once at startup from JSON files. */
export class ProblemCatalog {
  #problems = new Map();
  #samples;

  /**
   * @param {Problem[]} problems
   * @param {Map<string, object>} [samples] problem id → raw sample design (as a learner would submit it)
   */
  constructor(problems, samples = new Map()) {
    this.#samples = samples;
    for (const problem of problems) {
      if (this.#problems.has(problem.id)) throw new Error(`Duplicate problem id "${problem.id}"`);
      this.#problems.set(problem.id, problem);
    }
  }

  /**
   * Loads every `*.json` directly inside `dir` (subfolders such as samples/ are ignored).
   * Fails fast on any invalid file: a broken rubric should stop the server, not produce bad feedback.
   */
  static async fromDirectory(dir = DEFAULT_PROBLEMS_DIR) {
    const files = (await readdir(dir, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
      .map((entry) => entry.name)
      .sort();

    const problems = await Promise.all(files.map(async (file) => {
      const raw = await readJson(path.join(dir, file));
      const problem = parseProblemDefinition(raw, file);
      if (`${problem.id}.json` !== file) throw new Error(`Invalid ${file}: id "${problem.id}" must match the file name`);
      return problem;
    }));
    return new ProblemCatalog(problems, await loadSamples(path.join(dir, 'samples')));
  }

  list() {
    return [...this.#problems.values()].map((p) => p.toSummary());
  }

  /** @returns {Problem} */
  get(id) {
    const problem = this.#problems.get(id);
    if (!problem) throw new NotFoundError(`No problem with id "${id}"`);
    return problem;
  }

  /** A "decent but flawed" example design for demos. Returns a copy. */
  sample(id) {
    this.get(id);
    const sample = this.#samples.get(id);
    if (!sample) throw new NotFoundError(`No sample design for "${id}"`);
    return structuredClone(sample);
  }
}

/** samples/<problem-id>.json → Map; a missing folder just means no samples. */
async function loadSamples(dir) {
  let files;
  try {
    files = (await readdir(dir)).filter((name) => name.endsWith('.json'));
  } catch {
    return new Map();
  }
  const entries = await Promise.all(files.map(async (file) => [path.basename(file, '.json'), await readJson(path.join(dir, file))]));
  return new Map(entries);
}

async function readJson(file) {
  const text = await readFile(file, 'utf8');
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid ${path.basename(file)}: not valid JSON (${error.message})`);
  }
}
