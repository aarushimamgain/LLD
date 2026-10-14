import { api, ApiError } from './api.js';
import { applyFormAction, emptyForm, formFromDraft, formFromSubmission, formToSubmission, refreshEntitySelects, renderDesignForm, updateField } from './design-form.js';
import { IN_PROGRESS, debounce, esc } from './dom.js';
import { renderFeedback, renderHistory, renderProblemHeader, renderProblemList, renderThinkFirst } from './views.js';

/**
 * Hash routes:
 *   #/                                   problem list
 *   #/problems/:id/(think|design|feedback|history)
 *   #/problems/:id/feedback/:attemptId   feedback for one attempt
 */

const root = document.getElementById('app');
const POLL_MS = 1500;
const AUTOSAVE_MS = 800;

let navToken = 0; // bumps on every navigation so stale async work can tell it is stale
let pollTimer = null;
let page = null; // state of the open problem page

// ---------- routing ----------

async function route() {
  const token = ++navToken;
  clearTimeout(pollTimer);
  await saveNow();

  const [section, problemId, step = 'think', attemptId] = location.hash.replace(/^#\/?/, '').split('/');
  try {
    if (section === 'problems' && problemId) await showProblem(decodeURIComponent(problemId), step, attemptId, token);
    else await showProblemList(token);
  } catch (error) {
    if (token === navToken) root.innerHTML = errorNotice(error);
  }
  if (token === navToken) window.scrollTo({ top: 0 });
}

async function showProblemList(token) {
  page = null;
  const [{ problems }, history] = await Promise.all([api.problems(), api.history()]);
  if (token !== navToken) return;

  const stats = new Map();
  for (const a of history.attempts.filter((x) => x.status !== 'DRAFT')) {
    const s = stats.get(a.problemId) ?? { attempts: 0, best: null };
    s.attempts++;
    if (a.totalScore !== null) s.best = Math.max(s.best ?? 0, a.totalScore);
    stats.set(a.problemId, s);
  }
  root.innerHTML = renderProblemList(problems, stats);
}

async function showProblem(problemId, step, attemptId, token) {
  const context = await loadProblemContext(problemId);
  if (token !== navToken) return;
  page = context;

  root.innerHTML = `<div id="problem-header"></div><div id="step"></div>`;
  renderHeader(step);
  const stepEl = root.querySelector('#step');

  if (step === 'think') stepEl.innerHTML = renderThinkFirst(page.problem, page.form.assumptions, Boolean(page.draft));
  else if (step === 'design') renderDesignStep(stepEl);
  else if (step === 'history') stepEl.innerHTML = renderHistory(page.history, problemId, Boolean(page.draft));
  else if (step === 'feedback') {
    const id = attemptId ?? latestSubmitted(page.history)?.id;
    if (id) await pollFeedback(stepEl, id, token);
    else stepEl.innerHTML = `<div class="card empty"><p>No feedback yet: submit a design first.</p>
      <a class="btn btn-primary" href="#/problems/${esc(problemId)}/design">Go to design →</a></div>`;
  }
}

/**
 * Loads everything the problem page needs. The open draft (if any) drives the editable form;
 * otherwise the last submitted design is shown read-only. A learner's very first visit opens
 * a draft right away so their notes autosave.
 */
async function loadProblemContext(problemId) {
  const [{ problem }, history] = await Promise.all([api.problem(problemId), api.history(problemId)]);
  let draft = null;
  let form = emptyForm();
  let formWarning = null;

  const draftSummary = history.attempts.find((a) => a.status === 'DRAFT');
  if (draftSummary) draft = (await api.attempt(draftSummary.id)).attempt;
  else if (history.attempts.length === 0) {
    draft = (await api.start(problemId)).attempt;
    history.attempts.push(draft);
  }

  if (draft) ({ form, warning: formWarning } = formFromDraft(draft.draftText));
  else {
    const latest = latestSubmitted(history);
    if (latest) form = formFromSubmission((await api.attempt(latest.id)).attempt.submission);
  }
  return { problemId, problem, history, draft, form, formWarning, saveStatus: 'All changes saved' };
}

function renderHeader(step) {
  const submittedCount = page.history.attempts.filter((a) => a.status !== 'DRAFT').length;
  root.querySelector('#problem-header').innerHTML = renderProblemHeader(page.problem, step, submittedCount);
}

const latestSubmitted = (history) => history.attempts.filter((a) => a.status !== 'DRAFT').at(-1);

// ---------- design step ----------

function renderDesignStep(stepEl) {
  if (!page.draft) {
    const latest = latestSubmitted(page.history);
    stepEl.innerHTML = `
      <div class="notice notice-info">
        <span>Attempt #${latest.attemptNumber} has been submitted, so its design is shown read-only.</span>
        <button type="button" class="btn btn-primary" data-action="try-again">Try again from this design</button>
      </div>
      <div class="design-form">${renderDesignForm(page.form, { readOnly: true })}</div>`;
    return;
  }

  stepEl.innerHTML = `
    <div class="design-toolbar">
      <span class="muted">Attempt #${page.draft.attemptNumber} · draft</span>
      <span id="save-status" class="save-status">${esc(page.saveStatus)}</span>
      <button type="button" class="btn btn-ghost" data-action="load-sample">Load sample design</button>
    </div>
    ${page.formWarning ? `<div class="notice notice-warn">${esc(page.formWarning)}</div>` : ''}
    <form id="design-form" class="design-form" onsubmit="return false">${renderDesignForm(page.form)}</form>
    <div class="submit-bar">
      <div id="submit-errors"></div>
      <div class="submit-row">
        <p class="hint">Submitting locks this attempt and starts the review. You can always try again afterwards.</p>
        <button type="button" class="btn btn-primary btn-lg" data-action="submit">Submit for feedback</button>
      </div>
    </div>`;
}

/** Re-renders the form after a structural change, keeping focus on the same field. */
function rerenderForm() {
  const formEl = root.querySelector('#design-form');
  if (!formEl) return;
  const focusedPath = document.activeElement?.dataset?.path;
  formEl.innerHTML = renderDesignForm(page.form);
  if (focusedPath) formEl.querySelector(`[data-path="${focusedPath}"]`)?.focus();
}

async function loadSample() {
  const hasContent = page.form.entities.some((e) => e.name.trim()) || page.form.keyFlows.trim();
  if (hasContent && !confirm('Replace your current design with the sample design?')) return;
  const { sample } = await api.sample(page.problemId);
  page.form = formFromSubmission(sample);
  page.formWarning = null;
  rerenderForm();
  markDirty();
}

async function submit(button) {
  button.disabled = true;
  const errorsEl = root.querySelector('#submit-errors');
  errorsEl.innerHTML = '';
  try {
    await saveNow();
    const draftText = JSON.stringify(formToSubmission(page.form), null, 2);
    const { attempt } = await api.submit(page.draft.id, draftText);
    page.draft = null;
    location.hash = `#/problems/${encodeURIComponent(page.problemId)}/feedback/${attempt.id}`;
  } catch (error) {
    errorsEl.innerHTML = errorNotice(error);
    button.disabled = false;
  }
}

// ---------- autosave ----------

let dirty = false;
let saving = Promise.resolve();
const scheduleSave = debounce(() => saveNow(), AUTOSAVE_MS);

function markDirty() {
  if (!page?.draft) return;
  dirty = true;
  setSaveStatus('Unsaved changes…');
  scheduleSave();
}

/** Saves pending changes; calls are chained so saves never overlap. */
function saveNow() {
  scheduleSave.cancel();
  saving = saving.then(async () => {
    if (!dirty || !page?.draft) return;
    dirty = false;
    const draft = page.draft;
    const draftText = JSON.stringify(formToSubmission(page.form), null, 2);
    setSaveStatus('Saving…');
    try {
      await api.saveDraft(draft.id, draftText);
      draft.draftText = draftText;
      setSaveStatus('All changes saved');
    } catch (error) {
      dirty = true;
      setSaveStatus(`Not saved: ${error.message}`);
    }
  });
  return saving;
}

function setSaveStatus(text) {
  if (page) page.saveStatus = text;
  const el = root.querySelector('#save-status');
  if (el) el.textContent = text;
}

// ---------- feedback ----------

/** Shows an attempt and refreshes it every 1.5 s while it is being evaluated. */
async function pollFeedback(stepEl, attemptId, token) {
  let lastRendered = '';
  const tick = async () => {
    if (token !== navToken) return;
    let data;
    try {
      data = await api.attempt(attemptId);
    } catch (error) {
      stepEl.innerHTML = errorNotice(error);
      return;
    }
    if (token !== navToken) return;

    const snapshot = JSON.stringify(data);
    if (snapshot !== lastRendered) { // re-render only on change, so the page doesn't jump while reading
      lastRendered = snapshot;
      stepEl.innerHTML = renderFeedback(data, page.problemId);
    }
    if (IN_PROGRESS.has(data.attempt.status)) {
      pollTimer = setTimeout(tick, POLL_MS);
    } else if (page.history.attempts.find((a) => a.id === attemptId)?.status !== data.attempt.status) {
      page.history = await api.history(page.problemId); // keep the History tab count in sync
      if (token === navToken) renderHeader('feedback');
    }
  };
  page.feedbackAttemptId = attemptId;
  page.restartPolling = () => {
    clearTimeout(pollTimer);
    return tick();
  };
  await tick();
}

async function retry(button) {
  button.disabled = true;
  try {
    await api.retry(page.feedbackAttemptId);
    await page.restartPolling?.();
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
}

async function tryAgain(button) {
  button.disabled = true;
  try {
    await api.start(page.problemId); // the new draft starts from the previous design
    location.hash = `#/problems/${encodeURIComponent(page.problemId)}/design`;
  } catch (error) {
    button.disabled = false;
    alert(error.message);
  }
}

// ---------- events (delegated, bound once) ----------

root.addEventListener('input', (event) => {
  const path = event.target.dataset?.path;
  if (!path || !page?.draft || event.target.disabled) return;
  updateField(page.form, path, event.target.value);
  if (event.target.tagName === 'TEXTAREA') growToFit(event.target);
  markDirty();
});

root.addEventListener('change', (event) => {
  const path = event.target.dataset?.path;
  if (!path || !page?.draft || event.target.disabled) return;
  if (updateField(page.form, path, event.target.value)) refreshEntitySelects(root, page.form); // entity renamed
  markDirty();
});

root.addEventListener('click', (event) => {
  const button = event.target.closest('[data-action]');
  if (!button || !page) return;
  const { action, index } = button.dataset;

  if (applyFormAction(page.form, action, Number(index))) {
    rerenderForm();
    markDirty();
    return;
  }
  const handlers = { 'load-sample': loadSample, submit, retry, 'try-again': tryAgain };
  handlers[action]?.(button)?.catch?.((error) => alert(error.message));
});

window.addEventListener('beforeunload', (event) => {
  if (!dirty) return;
  saveNow();
  event.preventDefault();
});

window.addEventListener('hashchange', route);
route();

// ---------- helpers ----------

function growToFit(textarea) {
  if (textarea.scrollHeight > textarea.clientHeight) textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

function errorNotice(error) {
  const details = error instanceof ApiError && error.details.length
    ? `<ul>${error.details.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`
    : '';
  return `<div class="notice notice-bad"><div><strong>${esc(error.message)}</strong>${details}</div></div>`;
}
