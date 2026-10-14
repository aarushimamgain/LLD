import { DIMENSIONS, IN_PROGRESS, dimensionLabel, difficultyBadge, esc, formatDate, formatScore, signed, statusBadge } from './dom.js';

const SEVERITY_ORDER = ['issue', 'suggestion', 'info'];
const SEVERITY_LABEL = { issue: 'Issue', suggestion: 'Suggestion', info: 'Strength / note' };

// ---------- Problem list ----------

export function renderProblemList(problems, statsByProblem) {
  return `
    <section class="intro">
      <h1>Practise low-level design</h1>
      <p class="lead">Pick a problem, think it through, model it as classes and relationships, and get feedback that
        points at the exact class to change. Every attempt is kept, so you can see yourself improve.</p>
    </section>
    <div class="card-grid">
      ${problems.map((p) => {
        const stats = statsByProblem.get(p.id) ?? { attempts: 0, best: null };
        return `
          <a class="card problem-card" href="#/problems/${esc(p.id)}">
            <div class="problem-card-head">
              <h2>${esc(p.title)}</h2>
              ${difficultyBadge(p.difficulty)}
            </div>
            <p class="muted">${p.requirementCount} requirements</p>
            <div class="problem-card-stats">
              <span><strong>${stats.attempts}</strong> ${stats.attempts === 1 ? 'attempt' : 'attempts'}</span>
              <span>Best <strong>${stats.best === null ? '—' : `${formatScore(stats.best)}/100`}</strong></span>
            </div>
          </a>`;
      }).join('')}
    </div>`;
}

// ---------- Problem page ----------

export function renderProblemHeader(problem, step, attemptCount) {
  const steps = [
    ['think', '1', 'Think first'],
    ['design', '2', 'Design'],
    ['feedback', '3', 'Feedback'],
    ['history', '4', `History${attemptCount ? ` (${attemptCount})` : ''}`],
  ];
  return `
    <a class="back" href="#/">← All problems</a>
    <div class="problem-title">
      <h1>${esc(problem.title)}</h1>
      ${difficultyBadge(problem.difficulty)}
    </div>
    <nav class="steps" aria-label="Steps">
      ${steps.map(([id, n, label]) => `
        <a class="step ${id === step ? 'active' : ''}" href="#/problems/${esc(problem.id)}/${id}" ${id === step ? 'aria-current="step"' : ''}>
          <span class="step-n">${n}</span>${esc(label)}
        </a>`).join('')}
    </nav>`;
}

export function renderThinkFirst(problem, notes, editable) {
  return `
    <div class="think-grid">
      <div>
        <section class="card">
          <h2>The problem</h2>
          <p>${esc(problem.description)}</p>
        </section>
        <section class="card">
          <h2>Requirements</h2>
          <ul class="req-list">
            ${problem.requirements.map((r) => `<li><span class="req-id">${esc(r.id)}</span>${esc(r.text)}</li>`).join('')}
          </ul>
        </section>
        <section class="card">
          <h2>Constraints</h2>
          <ul>${problem.constraints.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>
        </section>
      </div>
      <div>
        <section class="card sticky">
          <h2>Before you design, decide…</h2>
          <ol class="question-list">${problem.clarifyingQuestions.map((q) => `<li>${esc(q)}</li>`).join('')}</ol>
          <label class="field">
            <span class="field-label">Your answers</span>
            <span class="hint">These become your design's assumptions and are part of the review.</span>
            <textarea data-path="assumptions" rows="8" placeholder="1. Cars, motorcycles and trucks; a car may use a large spot when compact is full.&#10;2. …" ${editable ? '' : 'disabled'}>${esc(notes)}</textarea>
          </label>
          ${editable ? '' : '<p class="hint">Showing your last submitted answers. Start a new attempt to change them.</p>'}
          <div class="actions"><a class="btn btn-primary" href="#/problems/${esc(problem.id)}/design">Next: design →</a></div>
        </section>
      </div>
    </div>`;
}

// ---------- Feedback ----------

/**
 * @param {object} data response of GET /api/attempts/:id
 */
export function renderFeedback({ attempt, comparison, concepts }, problemId) {
  const result = attempt.result;
  const evaluating = IN_PROGRESS.has(attempt.status);

  return `
    <div class="feedback-head">
      <div>
        <h2>Attempt #${attempt.attemptNumber} ${statusBadge(attempt.status)}</h2>
        <p class="muted">Updated ${formatDate(attempt.updatedAt)}</p>
      </div>
      ${comparison ? `<a class="delta-chip ${toneOf(comparison.scoreDelta)}" href="#/problems/${esc(problemId)}/history">
        ${signed(comparison.scoreDelta)} vs previous · ${comparison.fixed.length} fixed · ${comparison.introduced.length} new</a>` : ''}
    </div>

    ${attempt.statusMessage ? `
      <div class="notice notice-${attempt.status === 'FAILED' ? 'bad' : 'warn'}">
        <span>${esc(attempt.statusMessage)}</span>
        ${attempt.isRetryable ? '<button type="button" class="btn btn-secondary" data-action="retry">Retry evaluation</button>' : ''}
      </div>` : ''}

    ${!result ? `
      <div class="card waiting"><span class="spinner big" aria-hidden="true"></span>
        <div><strong>Checking your design…</strong><p class="muted">Rule-based feedback usually appears within a second.</p></div>
      </div>` : `
      ${evaluating ? `<div class="notice notice-info"><span class="spinner" aria-hidden="true"></span>
        Rule-based feedback and your score are ready. The AI review is still running and will appear below.</div>` : ''}
      <div class="feedback-top">
        ${renderScoreCard(result)}
        ${concepts ? renderConcepts(concepts) : ''}
      </div>
      ${renderItemsByDimension(result)}`}`;
}

function renderScoreCard(result) {
  return `
    <section class="card score-card">
      <div class="total">
        <span class="total-value">${formatScore(result.totalScore)}</span><span class="total-max">/ ${result.maxScore}</span>
      </div>
      <p class="hint">Each dimension starts at 10: an issue costs 2 points, a suggestion 1. AI feedback never changes the score.</p>
      <div class="bars">
        ${result.dimensionScores.map((d) => `
          <div class="bar-row">
            <span class="bar-label">${esc(dimensionLabel(d.dimension))}</span>
            <span class="bar-track"><span class="bar-fill ${barTone(d.earned / d.possible)}" style="width:${(d.earned / d.possible) * 100}%"></span></span>
            <span class="bar-value">${formatScore(d.earned)}/${d.possible}</span>
          </div>`).join('')}
      </div>
    </section>`;
}

function renderConcepts(concepts) {
  const covered = concepts.filter((c) => c.covered);
  const missing = concepts.filter((c) => !c.covered);
  return `
    <section class="card concepts">
      <h3>Rubric concepts <span class="muted">${covered.length}/${concepts.length} covered</span></h3>
      <ul class="concept-list">
        ${covered.map((c) => `<li class="concept ok"><span class="mark">✓</span>${esc(c.name)}<span class="chips">${c.entities.map(chip).join('')}</span></li>`).join('')}
        ${missing.map((c) => `<li class="concept missing"><span class="mark">✗</span>${esc(c.name)}${c.entities.length ? `<span class="chips">${c.entities.map(chip).join('')} <em>(empty)</em></span>` : ''}</li>`).join('')}
      </ul>
      <p class="hint">Different names are fine: concepts are matched by meaning-bearing words, not one reference answer.</p>
    </section>`;
}

function renderItemsByDimension(result) {
  return DIMENSIONS.map(({ id, label }) => {
    const score = result.dimensionScores.find((d) => d.dimension === id);
    const items = result.items
      .filter((i) => i.dimension === id)
      .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
    return `
      <section class="dimension">
        <h3>${esc(label)} <span class="muted">${formatScore(score.earned)}/${score.possible}</span></h3>
        ${items.length === 0 ? '<p class="empty-row">Nothing to flag here. Nice.</p>' : items.map(renderItem).join('')}
      </section>`;
  }).join('');
}

function renderItem(item) {
  return `
    <article class="item sev-${esc(item.severity)}">
      <div class="item-head">
        <span class="sev sev-${esc(item.severity)}">${SEVERITY_LABEL[item.severity] ?? esc(item.severity)}</span>
        <span class="source ${item.source === 'LLM' ? 'source-ai' : 'source-rule'}" title="${item.source === 'LLM' ? 'Written by the AI reviewer' : 'Deterministic rule check'}">${item.source === 'LLM' ? 'AI' : 'Rule'}</span>
        <span class="chips">${item.evidence.map(chip).join('')}</span>
      </div>
      <p class="item-message">${esc(item.message)}</p>
      <p class="item-suggestion"><strong>Try:</strong> ${esc(item.suggestion)}</p>
    </article>`;
}

// ---------- History ----------

export function renderHistory({ attempts, comparison }, problemId, hasOpenDraft) {
  const byId = new Map(attempts.map((a) => [a.id, a]));
  const action = hasOpenDraft
    ? `<a class="btn btn-primary" href="#/problems/${esc(problemId)}/design">Continue your draft →</a>`
    : '<button type="button" class="btn btn-primary" data-action="try-again">Try again (starts from your last design)</button>';

  if (attempts.length === 0) {
    return `<div class="card empty"><p>No attempts yet.</p><a class="btn btn-primary" href="#/problems/${esc(problemId)}/think">Start with "Think first" →</a></div>`;
  }

  return `
    <div class="history-actions">${action}</div>
    ${comparison ? renderComparison(comparison, byId) : '<p class="muted">Submit a second attempt to see what changed between attempts.</p>'}
    <section class="card">
      <h2>All attempts</h2>
      <table class="history-table">
        <thead><tr><th>#</th><th>When</th><th>Status</th><th>Score</th>${DIMENSIONS.map((d) => `<th title="${esc(d.label)}">${esc(shortLabel(d.id))}</th>`).join('')}<th></th></tr></thead>
        <tbody>
          ${[...attempts].reverse().map((a) => `
            <tr>
              <td>${a.attemptNumber}</td>
              <td>${formatDate(a.createdAt)}</td>
              <td>${statusBadge(a.status)}</td>
              <td><strong>${formatScore(a.totalScore)}</strong></td>
              ${DIMENSIONS.map((d) => `<td>${formatScore(a.dimensionScores.find((s) => s.dimension === d.id)?.earned)}</td>`).join('')}
              <td>${a.status === 'DRAFT'
                ? `<a href="#/problems/${esc(problemId)}/design">Edit draft</a>`
                : `<a href="#/problems/${esc(problemId)}/feedback/${esc(a.id)}">View feedback</a>`}</td>
            </tr>`).join('')}
        </tbody>
      </table>
    </section>`;
}

function renderComparison(comparison, byId) {
  const before = byId.get(comparison.previousAttemptId)?.attemptNumber;
  const after = byId.get(comparison.latestAttemptId)?.attemptNumber;
  return `
    <section class="card comparison">
      <div class="comparison-head">
        <h2>Attempt #${after} vs #${before}</h2>
        <span class="delta-big ${toneOf(comparison.scoreDelta)}">${signed(comparison.scoreDelta)} points</span>
      </div>
      <div class="dimension-deltas">
        ${comparison.dimensionDeltas.map((d) => `
          <div class="dimension-delta">
            <span class="bar-label">${esc(dimensionLabel(d.dimension))}</span>
            <span>${formatScore(d.previous)} → ${formatScore(d.latest)} <span class="muted">/ ${d.possible}</span></span>
            <span class="${toneOf(d.delta)}">${d.delta === 0 ? '=' : signed(d.delta)}</span>
          </div>`).join('')}
      </div>
      <div class="diff-columns">
        <div>
          <h3 class="good">Fixed (${comparison.fixed.length})</h3>
          ${comparison.fixed.length ? `<ul class="diff-list">${comparison.fixed.map((i) => `<li class="fixed">${esc(i.message)}</li>`).join('')}</ul>` : '<p class="empty-row">None yet.</p>'}
        </div>
        <div>
          <h3 class="bad">New issues (${comparison.introduced.length})</h3>
          ${comparison.introduced.length ? `<ul class="diff-list">${comparison.introduced.map((i) => `<li class="introduced">${esc(i.message)}</li>`).join('')}</ul>` : '<p class="empty-row">None. Nothing regressed.</p>'}
        </div>
      </div>
      <p class="hint">${comparison.persistingCount} finding(s) are still open from the previous attempt.</p>
    </section>`;
}

// ---------- helpers ----------

function chip(name) {
  return `<code class="chip">${esc(name)}</code>`;
}

function toneOf(delta) {
  if (delta > 0) return 'good';
  if (delta < 0) return 'bad';
  return 'neutral';
}

function barTone(ratio) {
  if (ratio >= 0.8) return 'good';
  if (ratio >= 0.5) return 'warn';
  return 'bad';
}

function shortLabel(id) {
  return { requirementsCoverage: 'Req', responsibilities: 'Resp', abstraction: 'Abs', relationships: 'Rel', patternsAndTradeoffs: 'Pat' }[id];
}
