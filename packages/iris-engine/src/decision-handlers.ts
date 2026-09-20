/**
 * Parallax Iris — decision handler (TypeSafe "System One" API, model Jev).
 *
 *   AI_DECISION — one typed question (noul / choice / score) about a state,
 *                 answered with a probability distribution + confidence; or,
 *                 in `multi` mode, several questions in a single call.
 *
 * Raw `fetch` against `POST /v1/systemone`, same convention as the analyzer
 * handlers — no SDK dependency in the engine. Wire format follows the
 * official TypeScript SDK (`@typesafe-ai/sdk` src/types.ts):
 *
 *   request  { model, state, questions: { <name>: { type, instructions, criteria } } }
 *   answer   noul   → { type: 'noul',   noul: number }
 *            choice → { type: 'choice', choice, confidence, probabilities }
 *            score  → { type: 'score',  score, confidence, probabilities, legend }
 *   usage    { input_tokens, output_tokens }
 *
 * Score criteria is an array of level descriptions indexed from zero (at
 * least two); the returned `score` is that index.
 */

import { getApiKeyForProvider } from './node-executor-config.js';

export type DecisionMode = 'noul' | 'choice' | 'score';

/**
 * An authoring mistake (empty question, one option, bad JSON). Never
 * retried and never covered by the node's `fallback` — the workflow is
 * wrong, not the provider.
 */
export class DecisionConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecisionConfigError';
  }
}

/**
 * The provider could not answer: missing key, transport failure, timeout,
 * non-2xx or a malformed body. `retryable` marks the transient subset
 * (429, 5xx, timeout, network) that the handler retries before giving up;
 * the node's `fallback` setting decides what happens after that.
 */
export class DecisionProviderError extends Error {
  readonly status?: number;
  readonly retryable: boolean;
  constructor(message: string, opts: { status?: number; retryable: boolean }) {
    super(message);
    this.name = 'DecisionProviderError';
    this.status = opts.status;
    this.retryable = opts.retryable;
  }
}

export interface DecisionOptionInput {
  label: string;
  description?: string | null;
}

interface DecisionCallOptions {
  /** Model id; `jev-latest` when omitted. */
  model?: string;
  /** Overrides `TYPESAFE_API_KEY` (BYOK hosts). */
  apiKey?: string;
  /** Per-attempt timeout; the SDK default is 10s. */
  timeoutMs?: number;
  /** Retries after the first attempt on transient failures (default 2,
   *  mirroring the official SDK). 0 disables. */
  maxRetries?: number;
  /** Test seam. */
  fetchImpl?: typeof fetch;
}

export interface DecisionConfig extends DecisionCallOptions {
  mode: DecisionMode;
  /** The question asked about the state. */
  question: string;
  /** choice mode — at least two options. */
  options?: DecisionOptionInput[];
  /** score mode — level descriptions, lowest first (2~10). */
  levels?: string[];
}

/** One normalized answer, whatever the question type. */
export interface DecisionAnswer {
  mode: DecisionMode;
  /** noul → boolean, choice → label, score → 0-based level index. */
  answer: boolean | string | number;
  /**
   * How sure the model is of `answer`, 0~1. noul has no confidence on the
   * wire, so it is derived as max(p, 1 - p).
   */
  confidence: number;
  /** noul → P(yes); choice → per-label; score → per-level (string keys). */
  probabilities: Record<string, number>;
}

interface DecisionUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  /** Wall-clock time of the whole call, retries included. */
  latencyMs: number;
  /** HTTP attempts made (1 = no retry). */
  attempts: number;
}

export type DecisionResult = DecisionAnswer & DecisionUsage;

/**
 * A question as authored in the `multi` mode JSON textarea. Mirrors the
 * SDK's question shape with a friendlier `criteria` for choice
 * (`{ label: description | null }`) and score (`string[]`, lowest first).
 */
export interface RawDecisionQuestion {
  type: DecisionMode;
  instructions?: string;
  criteria?: Record<string, string | null> | string[] | null;
}

export interface MultiDecisionConfig extends DecisionCallOptions {
  questions: Record<string, RawDecisionQuestion>;
}

export interface MultiDecisionResult extends DecisionUsage {
  answers: Record<string, DecisionAnswer>;
}

export const TYPESAFE_API_BASE_URL = 'https://api.typesafe.ai';
export const TYPESAFE_DEFAULT_MODEL = 'jev-latest';
/** Jev 1.13 list price per 1M input tokens (output is free). Verify against
 *  the official price list before changing billing on top of it. */
export const JEV_INPUT_USD_PER_M_TOKENS = 0.042;
/** Jev accepts up to 255 choice options and 2~10 score levels (second-hand
 *  figures; the official docs were unreachable when this was written). */
export const JEV_MAX_CHOICE_OPTIONS = 255;
export const JEV_MIN_SCORE_LEVELS = 2;
export const JEV_MAX_SCORE_LEVELS = 10;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 500;
const RETRY_BACKOFF_MAX_MS = 5_000;

/**
 * Everything that changes when TypeSafe changes its terms lives here, so a
 * price or limit revision is a one-file edit: `JEV_INPUT_USD_PER_M_TOKENS`,
 * the option / level limits, and the timeout / retry defaults above.
 */
export function getJevOperatingLimits() {
  return {
    inputUsdPerMTokens: JEV_INPUT_USD_PER_M_TOKENS,
    maxChoiceOptions: JEV_MAX_CHOICE_OPTIONS,
    minScoreLevels: JEV_MIN_SCORE_LEVELS,
    maxScoreLevels: JEV_MAX_SCORE_LEVELS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxRetries: DEFAULT_MAX_RETRIES,
    defaultModel: TYPESAFE_DEFAULT_MODEL,
  } as const;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

type WireQuestion =
  | { type: 'noul'; instructions: string }
  | { type: 'choice'; instructions: string; criteria: Record<string, string | null> }
  | { type: 'score'; instructions: string; criteria: string[] };

function buildQuestion(config: DecisionConfig): WireQuestion {
  const instructions = config.question.trim();
  if (!instructions) throw new DecisionConfigError('AI_DECISION: question is required');

  switch (config.mode) {
    case 'noul':
      return { type: 'noul', instructions };
    case 'choice': {
      const options = config.options ?? [];
      if (options.length < 2) {
        throw new DecisionConfigError('AI_DECISION: choice mode needs at least two options');
      }
      if (options.length > JEV_MAX_CHOICE_OPTIONS) {
        throw new DecisionConfigError(
          `AI_DECISION: choice mode supports at most ${JEV_MAX_CHOICE_OPTIONS} options`
        );
      }
      const criteria: Record<string, string | null> = {};
      for (const o of options) criteria[o.label] = o.description ?? null;
      return { type: 'choice', instructions, criteria };
    }
    case 'score': {
      const levels = config.levels ?? [];
      if (levels.length < JEV_MIN_SCORE_LEVELS || levels.length > JEV_MAX_SCORE_LEVELS) {
        throw new DecisionConfigError(
          `AI_DECISION: score mode needs ${JEV_MIN_SCORE_LEVELS} to ${JEV_MAX_SCORE_LEVELS} levels`
        );
      }
      return { type: 'score', instructions, criteria: levels };
    }
    default:
      throw new DecisionConfigError(`AI_DECISION: unknown mode "${String(config.mode)}"`);
  }
}

/** Validate one authored multi-mode question and lift it to the wire shape. */
function buildRawQuestion(name: string, raw: RawDecisionQuestion): WireQuestion {
  if (!raw || typeof raw !== 'object') {
    throw new DecisionConfigError(`AI_DECISION: question "${name}" must be an object`);
  }
  const instructions = typeof raw.instructions === 'string' ? raw.instructions : '';
  switch (raw.type) {
    case 'noul':
      return buildQuestion({ mode: 'noul', question: instructions || name });
    case 'choice': {
      const c = raw.criteria;
      if (!c || typeof c !== 'object' || Array.isArray(c)) {
        throw new DecisionConfigError(
          `AI_DECISION: question "${name}" (choice) needs criteria { label: description | null }`
        );
      }
      const options = Object.entries(c).map(([label, description]) => ({
        label,
        description: typeof description === 'string' ? description : null,
      }));
      return buildQuestion({ mode: 'choice', question: instructions || name, options });
    }
    case 'score': {
      const c = raw.criteria;
      if (!Array.isArray(c) || !c.every(l => typeof l === 'string')) {
        throw new DecisionConfigError(
          `AI_DECISION: question "${name}" (score) needs criteria as an array of level descriptions`
        );
      }
      return buildQuestion({ mode: 'score', question: instructions || name, levels: c });
    }
    default:
      throw new DecisionConfigError(
        `AI_DECISION: question "${name}" has unknown type "${String((raw as { type?: unknown }).type)}"`
      );
  }
}

function toStateEntry(input: unknown): string | Record<string, unknown> | unknown[] {
  if (typeof input === 'string') return input;
  if (input === null || input === undefined) return '';
  if (typeof input === 'object') return input as Record<string, unknown> | unknown[];
  return String(input);
}

function readNumber(v: unknown, what: string): number {
  if (typeof v !== 'number' || Number.isNaN(v)) {
    throw new DecisionProviderError(
      `AI_DECISION: malformed response — ${what} is not a number`,
      { retryable: false }
    );
  }
  return v;
}

function readProbabilities(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, p] of Object.entries(v as Record<string, unknown>)) {
      if (typeof p === 'number') out[k] = p;
    }
  }
  return out;
}

function normalizeAnswer(mode: DecisionMode, answer: unknown): DecisionAnswer {
  if (!answer || typeof answer !== 'object') {
    throw new DecisionProviderError(
      'AI_DECISION: malformed response — no answer returned',
      { retryable: false }
    );
  }
  const a = answer as Record<string, unknown>;
  switch (mode) {
    case 'noul': {
      const p = readNumber(a.noul, 'noul');
      return {
        mode,
        answer: p >= 0.5,
        confidence: Math.max(p, 1 - p),
        probabilities: { true: p, false: 1 - p },
      };
    }
    case 'choice':
      if (typeof a.choice !== 'string') {
        throw new DecisionProviderError(
          'AI_DECISION: malformed response — choice is not a string',
          { retryable: false }
        );
      }
      return {
        mode,
        answer: a.choice,
        confidence: readNumber(a.confidence, 'confidence'),
        probabilities: readProbabilities(a.probabilities),
      };
    case 'score':
      return {
        mode,
        answer: readNumber(a.score, 'score'),
        confidence: readNumber(a.confidence, 'confidence'),
        probabilities: readProbabilities(a.probabilities),
      };
  }
}

interface SystemOneResponse {
  model: string;
  answers: Record<string, unknown>;
  usage: DecisionUsage;
}

/** POST /v1/systemone. Throws on missing key, transport error, timeout,
 *  non-2xx or an unparsable body. */
async function callSystemOne(
  state: unknown,
  questions: Record<string, WireQuestion>,
  opts: DecisionCallOptions
): Promise<SystemOneResponse> {
  const apiKey = opts.apiKey ?? getApiKeyForProvider('typesafe');
  if (!apiKey) {
    throw new DecisionProviderError(
      'AI_DECISION: TYPESAFE_API_KEY is not configured (set it in the host environment or BYOK settings)',
      { retryable: false }
    );
  }

  const model = opts.model?.trim() || TYPESAFE_DEFAULT_MODEL;
  const maxRetries = Math.max(0, opts.maxRetries ?? DEFAULT_MAX_RETRIES);
  const startedAt = Date.now();
  let attempts = 0;
  let lastError: DecisionProviderError | undefined;

  while (attempts <= maxRetries) {
    attempts++;
    try {
      const body = await postSystemOne(apiKey, model, state, questions, opts);
      const inputTokens = body.usage?.input_tokens ?? 0;
      const outputTokens = body.usage?.output_tokens ?? 0;
      return {
        model: body.model ?? model,
        answers: body.answers ?? {},
        usage: {
          model: body.model ?? model,
          inputTokens,
          outputTokens,
          estimatedCostUsd: (inputTokens / 1_000_000) * JEV_INPUT_USD_PER_M_TOKENS,
          latencyMs: Date.now() - startedAt,
          attempts,
        },
      };
    } catch (err) {
      if (!(err instanceof DecisionProviderError)) throw err;
      lastError = err;
      if (!err.retryable || attempts > maxRetries) break;
      await sleep(
        Math.min(RETRY_BACKOFF_MS * 2 ** (attempts - 1), RETRY_BACKOFF_MAX_MS)
      );
    }
  }
  throw lastError ?? new DecisionProviderError('AI_DECISION: TypeSafe request failed', { retryable: false });
}

/** One HTTP attempt. Classifies failures so the caller can decide to retry. */
async function postSystemOne(
  apiKey: string,
  model: string,
  state: unknown,
  questions: Record<string, WireQuestion>,
  opts: DecisionCallOptions
): Promise<{
  model?: string;
  answers?: Record<string, unknown>;
  usage?: { input_tokens?: number; output_tokens?: number };
}> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  );

  let response: Response;
  try {
    response = await fetchImpl(`${TYPESAFE_API_BASE_URL}/v1/systemone`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ model, state: toStateEntry(state), questions }),
      signal: controller.signal,
    });
  } catch (err) {
    const timedOut = (err as Error).name === 'AbortError';
    throw new DecisionProviderError(
      `AI_DECISION: TypeSafe request failed — ${timedOut ? 'request timed out' : (err as Error).message}`,
      { retryable: true }
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  if (!response.ok) {
    const detail =
      (json &&
        typeof json === 'object' &&
        ((json as { error?: { message?: string } }).error?.message ??
          (json as { message?: string }).message)) ||
      text.slice(0, 200) ||
      response.statusText;
    throw new DecisionProviderError(
      `AI_DECISION: TypeSafe API ${response.status} — ${detail}`,
      { status: response.status, retryable: response.status === 429 || response.status >= 500 }
    );
  }

  if (!json || typeof json !== 'object') {
    throw new DecisionProviderError(
      'AI_DECISION: malformed response — body is not JSON',
      { status: response.status, retryable: false }
    );
  }
  return json as {
    model?: string;
    answers?: Record<string, unknown>;
    usage?: { input_tokens?: number; output_tokens?: number };
  };
}

/**
 * Ask Jev one typed question about `state`. Throws on missing key, HTTP
 * error, timeout or malformed answer; the engine's per-node retry handles
 * transient failures.
 */
export async function executeDecision(
  state: unknown,
  config: DecisionConfig
): Promise<DecisionResult> {
  const question = buildQuestion(config);
  const res = await callSystemOne(state, { decision: question }, config);
  return { ...normalizeAnswer(config.mode, res.answers.decision), ...res.usage };
}

/**
 * Ask Jev several typed questions about the same `state` in one call
 * (`multi` mode). Questions are evaluated independently; the result keeps
 * each answer under its authored name.
 */
export async function executeDecisionMulti(
  state: unknown,
  config: MultiDecisionConfig
): Promise<MultiDecisionResult> {
  const names = Object.keys(config.questions ?? {});
  if (names.length === 0) {
    throw new DecisionConfigError('AI_DECISION: multi mode needs at least one question');
  }
  const wire: Record<string, WireQuestion> = {};
  for (const name of names) {
    wire[name] = buildRawQuestion(name, config.questions[name]);
  }

  const res = await callSystemOne(state, wire, config);
  const answers: Record<string, DecisionAnswer> = {};
  for (const name of names) {
    answers[name] = normalizeAnswer(wire[name].type, res.answers[name]);
  }
  return { answers, ...res.usage };
}
