/**
 * Parallax Iris — ANALYZER handlers (engine, raw-fetch).
 *
 *   DOC_LONG_CONTEXT      — long-context Q&A with provider prompt cache
 *   AI_STRUCTURED_EXTRACT — JSON-Schema-conforming extraction
 *   AI_CATEGORIZE         — N-way classification (reuses STRUCTURED_EXTRACT)
 *
 * Each handler dispatches per provider (openai/anthropic/google) because the
 * structured-output and prompt-cache surfaces differ across them.
 *
 * The engine is deliberately dep-light: instead of the openai / @anthropic-ai
 * / @google/generative-ai SDKs, these call the provider HTTP APIs directly with
 * `fetch` (the same convention as the provider adapters). Document text
 * extraction is host-coupled (asset URLs need storage), so `executeDocLongContext`
 * receives the *already-extracted* document text — the caller (node-executor)
 * resolves it through the host first.
 */

import { getApiKeyForProvider } from './node-executor-config.js';

// ============================================================
// Shared helpers
// ============================================================

export interface AnalyzerCallResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  /** USD vendor cost — converted to credits at the call site. */
  estimatedCostUsd: number;
  /** Provider-reported prompt-cache hit flag (best-effort). */
  cached: boolean;
}

const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 0.0025 / 1000, output: 0.01 / 1000 },
  'gpt-4o-mini': { input: 0.00015 / 1000, output: 0.0006 / 1000 },
  'gpt-4o-2024-08-06': { input: 0.0025 / 1000, output: 0.01 / 1000 },
  'gpt-4.1': { input: 0.002 / 1000, output: 0.008 / 1000 },
  'gpt-4.1-mini': { input: 0.0004 / 1000, output: 0.0016 / 1000 },
  'gpt-5': { input: 0.005 / 1000, output: 0.02 / 1000 },
  'gpt-5-mini': { input: 0.0005 / 1000, output: 0.002 / 1000 },
};

const ANTHROPIC_PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-4-5-20251101': { input: 0.000015, output: 0.000075 },
  'claude-sonnet-4-5-20250929': { input: 0.000003, output: 0.000015 },
  'claude-opus-4-1-20250805': { input: 0.000015, output: 0.000075 },
  'claude-sonnet-4-20250514': { input: 0.000003, output: 0.000015 },
  'claude-3-5-sonnet-20241022': { input: 0.000003, output: 0.000015 },
};

const GEMINI_PRICING: Record<string, { input: number; output: number }> = {
  'gemini-2.0-flash': { input: 0.0001 / 1000, output: 0.0004 / 1000 },
  'gemini-1.5-pro': { input: 0.00125 / 1000, output: 0.005 / 1000 },
  'gemini-2.5-pro': { input: 0.00125 / 1000, output: 0.005 / 1000 },
  'gemini-2.5-flash': { input: 0.000075 / 1000, output: 0.0003 / 1000 },
};

function priceFor(
  provider: string,
  model: string,
  inputTokens: number,
  outputTokens: number
): number {
  const table =
    provider === 'openai'
      ? OPENAI_PRICING
      : provider === 'anthropic'
        ? ANTHROPIC_PRICING
        : provider === 'google'
          ? GEMINI_PRICING
          : {};
  const entry = (table as Record<string, { input: number; output: number }>)[
    model
  ];
  if (!entry) return 0;
  return entry.input * inputTokens + entry.output * outputTokens;
}

// ============================================================
// Raw-fetch provider clients (replace the openai/anthropic/google SDKs)
// ============================================================

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string | null } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
}

async function openaiChatCompletion(
  body: Record<string, unknown>
): Promise<OpenAIChatResponse> {
  const apiKey = getApiKeyForProvider('openai');
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `OpenAI API error ${response.status}: ${errText.substring(0, 300)}`
    );
  }
  return (await response.json()) as OpenAIChatResponse;
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  name?: string;
  input?: unknown;
}

interface AnthropicResponse {
  content?: AnthropicContentBlock[];
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

async function anthropicMessages(
  body: Record<string, unknown>
): Promise<AnthropicResponse> {
  const apiKey = getApiKeyForProvider('anthropic');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured');
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Anthropic API error ${response.status}: ${errText.substring(0, 300)}`
    );
  }
  return (await response.json()) as AnthropicResponse;
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    cachedContentTokenCount?: number;
  };
}

async function geminiGenerateContent(
  model: string,
  body: Record<string, unknown>
): Promise<GeminiResponse> {
  const apiKey = getApiKeyForProvider('google');
  if (!apiKey) throw new Error('GOOGLE_API_KEY not configured');
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) {
    const errText = await response.text();
    throw new Error(
      `Google AI API error ${response.status}: ${errText.substring(0, 300)}`
    );
  }
  return (await response.json()) as GeminiResponse;
}

/** Concatenate a Gemini response's candidate text parts (mirrors SDK `.text()`). */
function geminiText(res: GeminiResponse): string {
  return (res.candidates?.[0]?.content?.parts ?? [])
    .map(p => p.text ?? '')
    .join('');
}

// ============================================================
// DOC_LONG_CONTEXT
// ============================================================

export interface DocLongContextConfig {
  provider: string;
  model: string;
  enableCache: boolean;
  maxAnswerTokens: number;
}

/**
 * Q&A over a full document. Dispatches to the provider-specific code path so we
 * can opt into prompt-cache surfaces (Anthropic `cache_control: ephemeral`,
 * Gemini implicit, OpenAI automatic).
 *
 * `documentText` is the already-extracted plain text — the caller resolves the
 * file through the host (storage/Prisma) before calling this.
 */
export async function executeDocLongContext(
  documentText: string,
  query: string,
  config: DocLongContextConfig
): Promise<AnalyzerCallResult> {
  const provider = config.provider.toLowerCase();

  const systemPrompt =
    'You are a careful assistant. Answer the user question using ONLY the document content. ' +
    'If the answer is not in the document, say so explicitly. Quote relevant passages briefly.';

  switch (provider) {
    case 'anthropic':
      return callAnthropic(
        documentText,
        query,
        systemPrompt,
        config.model,
        config.maxAnswerTokens,
        config.enableCache
      );
    case 'google':
      return callGemini(
        documentText,
        query,
        systemPrompt,
        config.model,
        config.maxAnswerTokens
      );
    case 'openai':
    default:
      return callOpenAI(
        documentText,
        query,
        systemPrompt,
        config.model,
        config.maxAnswerTokens
      );
  }
}

async function callAnthropic(
  documentText: string,
  query: string,
  systemPrompt: string,
  model: string,
  maxAnswerTokens: number,
  enableCache: boolean
): Promise<AnalyzerCallResult> {
  // The document goes into a system block with cache_control so repeat queries
  // reuse it. Per Anthropic docs, cache_control on a text block inside `system`
  // is the supported "long static context" pattern.
  const systemBlocks: Array<Record<string, unknown>> = [
    { type: 'text', text: systemPrompt },
    {
      type: 'text',
      text: `Document:\n${documentText}`,
      ...(enableCache ? { cache_control: { type: 'ephemeral' } } : {}),
    },
  ];

  const response = await anthropicMessages({
    model,
    max_tokens: maxAnswerTokens,
    system: systemBlocks,
    messages: [{ role: 'user', content: query }],
  });

  const text = (response.content ?? [])
    .filter(b => b.type === 'text')
    .map(b => b.text ?? '')
    .join('\n');

  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;
  // cache_read_input_tokens > 0 indicates a cache hit (post 2024-08 API).
  const cached = (response.usage?.cache_read_input_tokens ?? 0) > 0;

  return {
    text,
    inputTokens,
    outputTokens,
    estimatedCostUsd: priceFor('anthropic', model, inputTokens, outputTokens),
    cached,
  };
}

async function callGemini(
  documentText: string,
  query: string,
  systemPrompt: string,
  model: string,
  maxAnswerTokens: number
): Promise<AnalyzerCallResult> {
  const response = await geminiGenerateContent(model, {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        parts: [{ text: `Document:\n${documentText}\n\nQuestion: ${query}` }],
      },
    ],
    generationConfig: { maxOutputTokens: maxAnswerTokens },
  });

  const text = geminiText(response);
  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;
  const cached = (usage?.cachedContentTokenCount ?? 0) > 0;

  return {
    text,
    inputTokens,
    outputTokens,
    estimatedCostUsd: priceFor('google', model, inputTokens, outputTokens),
    cached,
  };
}

async function callOpenAI(
  documentText: string,
  query: string,
  systemPrompt: string,
  model: string,
  maxAnswerTokens: number
): Promise<AnalyzerCallResult> {
  // OpenAI prompt caching is automatic for prompts > 1024 tokens with the same
  // prefix — no per-call header. We just construct the conversation with the
  // static document portion first so it caches.
  const completion = await openaiChatCompletion({
    model,
    max_tokens: maxAnswerTokens,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Document:\n${documentText}` },
      { role: 'user', content: `Question: ${query}` },
    ],
  });

  const text = completion.choices?.[0]?.message?.content ?? '';
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  const cached =
    (completion.usage?.prompt_tokens_details?.cached_tokens ?? 0) > 0;

  return {
    text,
    inputTokens,
    outputTokens,
    estimatedCostUsd: priceFor('openai', model, inputTokens, outputTokens),
    cached,
  };
}

// ============================================================
// AI_STRUCTURED_EXTRACT
// ============================================================

export interface StructuredExtractConfig {
  provider: string;
  model: string;
  schema: object;
  instructions?: string;
}

export interface StructuredExtractResult {
  data: unknown;
  valid: boolean;
  rawText: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

/**
 * Extract a JSON-Schema-conforming object from free-form input. Each provider
 * has a different opt-in for strict structured outputs; we pick the best one
 * available and fall back to coerce-then-validate.
 */
export async function executeStructuredExtract(
  input: unknown,
  config: StructuredExtractConfig
): Promise<StructuredExtractResult> {
  const provider = config.provider.toLowerCase();
  const inputAsText =
    typeof input === 'string' ? input : JSON.stringify(input, null, 2);
  const userPrompt = config.instructions
    ? `${config.instructions}\n\nInput:\n${inputAsText}`
    : `Extract the requested fields from this input:\n\n${inputAsText}`;

  switch (provider) {
    case 'openai':
      return extractWithOpenAI(userPrompt, config);
    case 'anthropic':
      return extractWithAnthropic(userPrompt, config);
    case 'google':
      return extractWithGemini(userPrompt, config);
    default:
      throw new Error(`AI_STRUCTURED_EXTRACT: unknown provider ${provider}`);
  }
}

async function extractWithOpenAI(
  userPrompt: string,
  config: StructuredExtractConfig
): Promise<StructuredExtractResult> {
  const completion = await openaiChatCompletion({
    model: config.model,
    messages: [
      {
        role: 'system',
        content:
          'Return ONLY a JSON object conforming exactly to the provided schema.',
      },
      { role: 'user', content: userPrompt },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'extraction',
        strict: true,
        schema: config.schema as Record<string, unknown>,
      },
    },
  });

  const raw = completion.choices?.[0]?.message?.content ?? '';
  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;
  let data: unknown = null;
  let valid = false;
  try {
    data = JSON.parse(raw);
    valid = true;
  } catch {
    // strict json_schema mode shouldn't produce un-parseable output, but if
    // the model returned nothing we surface valid=false.
  }
  return {
    data,
    valid,
    rawText: raw,
    inputTokens,
    outputTokens,
    estimatedCostUsd: priceFor(
      'openai',
      config.model,
      inputTokens,
      outputTokens
    ),
  };
}

async function extractWithAnthropic(
  userPrompt: string,
  config: StructuredExtractConfig
): Promise<StructuredExtractResult> {
  // Forced tool-use is Anthropic's documented structured-output pattern.
  const toolName = 'emit_extraction';
  const response = await anthropicMessages({
    model: config.model,
    max_tokens: 4096,
    tools: [
      {
        name: toolName,
        description: 'Emit the extracted data conforming to the schema.',
        input_schema: config.schema,
      },
    ],
    tool_choice: { type: 'tool', name: toolName },
    messages: [{ role: 'user', content: userPrompt }],
  });

  const toolCall = (response.content ?? []).find(b => b.type === 'tool_use');
  const data = toolCall?.input ?? null;
  const valid = data !== null;
  const inputTokens = response.usage?.input_tokens ?? 0;
  const outputTokens = response.usage?.output_tokens ?? 0;

  return {
    data,
    valid,
    rawText: JSON.stringify(data ?? {}),
    inputTokens,
    outputTokens,
    estimatedCostUsd: priceFor(
      'anthropic',
      config.model,
      inputTokens,
      outputTokens
    ),
  };
}

async function extractWithGemini(
  userPrompt: string,
  config: StructuredExtractConfig
): Promise<StructuredExtractResult> {
  const response = await geminiGenerateContent(config.model, {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      // Gemini accepts a JSON schema via responseSchema (subset support).
      responseSchema: config.schema,
    },
  });

  const raw = geminiText(response);
  const usage = response.usageMetadata;
  const inputTokens = usage?.promptTokenCount ?? 0;
  const outputTokens = usage?.candidatesTokenCount ?? 0;

  let data: unknown = null;
  let valid = false;
  try {
    data = JSON.parse(raw);
    valid = true;
  } catch {
    // leave valid=false
  }
  return {
    data,
    valid,
    rawText: raw,
    inputTokens,
    outputTokens,
    estimatedCostUsd: priceFor(
      'google',
      config.model,
      inputTokens,
      outputTokens
    ),
  };
}

// ============================================================
// AI_CATEGORIZE — implemented as a STRUCTURED_EXTRACT special case
// ============================================================

export interface CategorizeConfig {
  provider: string;
  model: string;
  categories: string[];
  allowMultiple: boolean;
}

export interface CategorizeResult {
  category: string | null;
  matched: string[];
  confidence: number | null;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

/**
 * Build a JSON Schema constraining the LLM to pick from `categories`, then hand
 * off to `executeStructuredExtract`. Multi-label switches the schema from
 * `enum` to `array of enum`.
 */
export async function executeCategorize(
  input: unknown,
  config: CategorizeConfig
): Promise<CategorizeResult> {
  if (!config.categories || config.categories.length === 0) {
    throw new Error('AI_CATEGORIZE: categories list is required');
  }

  const schema = config.allowMultiple
    ? {
        type: 'object',
        properties: {
          labels: {
            type: 'array',
            items: { type: 'string', enum: config.categories },
          },
        },
        required: ['labels'],
        additionalProperties: false,
      }
    : {
        type: 'object',
        properties: {
          label: { type: 'string', enum: config.categories },
        },
        required: ['label'],
        additionalProperties: false,
      };

  const instructions = config.allowMultiple
    ? `Classify the input. Pick every label that applies from this list, in priority order:\n${config.categories.join(', ')}`
    : `Classify the input. Pick exactly one label from this list:\n${config.categories.join(', ')}`;

  const extracted = await executeStructuredExtract(input, {
    provider: config.provider,
    model: config.model,
    schema,
    instructions,
  });

  let matched: string[] = [];
  if (extracted.valid && extracted.data && typeof extracted.data === 'object') {
    const data = extracted.data as Record<string, unknown>;
    if (config.allowMultiple && Array.isArray(data.labels)) {
      matched = (data.labels as unknown[])
        .filter((x): x is string => typeof x === 'string')
        .filter(x => config.categories.includes(x));
    } else if (
      typeof data.label === 'string' &&
      config.categories.includes(data.label)
    ) {
      matched = [data.label];
    }
  }

  return {
    category: matched[0] ?? null,
    matched,
    // Confidence requires logprobs which we don't request here — surface null
    // so downstream knows it's unavailable rather than guessing.
    confidence: null,
    inputTokens: extracted.inputTokens,
    outputTokens: extracted.outputTokens,
    estimatedCostUsd: extracted.estimatedCostUsd,
  };
}
