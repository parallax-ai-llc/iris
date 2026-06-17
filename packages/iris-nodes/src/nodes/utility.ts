import type { NodeDefinition } from '../types.js';

export const UTIL_DELAY: NodeDefinition = {
  type: 'UTIL_DELAY',
  category: 'UTILITY',
  label: 'Delay',
  description: 'Wait for specified time',
  iconName: 'Timer',
  color: 'gray',
  inputs: [
    { name: 'input', type: 'any', label: 'Input', required: true },
  ],
  outputs: [
    { name: 'output', type: 'any', label: 'Output' },
  ],
  configFields: [
    {
      name: 'duration',
      label: 'Duration (ms)',
      type: 'number',
      min: 0,
      max: 60000,
      defaultValue: 1000,
    },
  ],
};

export const UTIL_CONDITION: NodeDefinition = {
  type: 'UTIL_CONDITION',
  category: 'UTILITY',
  label: 'Condition',
  description: 'Branch based on condition',
  iconName: 'GitBranch',
  color: 'gray',
  inputs: [
    { name: 'input', type: 'any', label: 'Input', required: true },
  ],
  outputs: [
    { name: 'true', type: 'any', label: 'True' },
    { name: 'false', type: 'any', label: 'False' },
  ],
  configFields: [
    {
      name: 'condition',
      label: 'Condition',
      type: 'select',
      options: [
        { value: 'equals', label: 'Equals' },
        { value: 'contains', label: 'Contains' },
        { value: 'startsWith', label: 'Starts With' },
        { value: 'endsWith', label: 'Ends With' },
        { value: 'greaterThan', label: 'Greater Than' },
        { value: 'lessThan', label: 'Less Than' },
        { value: 'isEmpty', label: 'Is Empty' },
        { value: 'isNotEmpty', label: 'Is Not Empty' },
      ],
      defaultValue: 'equals',
    },
    {
      name: 'compareValue',
      label: 'Compare Value',
      type: 'text',
    },
  ],
};

export const UTIL_LOOP: NodeDefinition = {
  type: 'UTIL_LOOP',
  category: 'UTILITY',
  label: 'Loop',
  description: 'Iterate over items',
  iconName: 'Repeat',
  color: 'gray',
  inputs: [
    { name: 'items', type: 'json', label: 'Items', required: true },
  ],
  outputs: [
    { name: 'item', type: 'any', label: 'Current Item' },
    { name: 'index', type: 'any', label: 'Index' },
    { name: 'done', type: 'trigger', label: 'Done' },
  ],
  configFields: [
    {
      name: 'maxIterations',
      label: 'Max Iterations',
      type: 'number',
      min: 1,
      max: 1000,
      defaultValue: 100,
    },
  ],
};

export const UTIL_MERGE: NodeDefinition = {
  type: 'UTIL_MERGE',
  category: 'UTILITY',
  label: 'Merge',
  description: 'Combine multiple inputs',
  iconName: 'Merge',
  color: 'gray',
  inputs: [
    { name: 'input1', type: 'any', label: 'Input 1', required: true },
    { name: 'input2', type: 'any', label: 'Input 2' },
    { name: 'input3', type: 'any', label: 'Input 3' },
    { name: 'input4', type: 'any', label: 'Input 4' },
  ],
  outputs: [
    { name: 'merged', type: 'json', label: 'Merged' },
  ],
  configFields: [
    {
      name: 'mode',
      label: 'Merge Mode',
      type: 'select',
      options: [
        { value: 'object', label: 'As Object' },
        { value: 'array', label: 'As Array' },
        { value: 'concat', label: 'Concatenate (Text)' },
      ],
      defaultValue: 'object',
    },
  ],
};

export const UTIL_SPLIT: NodeDefinition = {
  type: 'UTIL_SPLIT',
  category: 'UTILITY',
  label: 'Split',
  description: 'Split input into two parts',
  iconName: 'Scissors',
  color: 'gray',
  inputs: [
    { name: 'input', type: 'any', label: 'Input', required: true },
  ],
  outputs: [
    { name: 'output1', type: 'any', label: 'First Part' },
    { name: 'output2', type: 'any', label: 'Remaining Parts' },
  ],
  configFields: [
    {
      name: 'separator',
      label: 'Separator',
      type: 'text',
      defaultValue: ',',
      description: 'Character to split text by',
    },
  ],
};

export const UTIL_TRANSFORM: NodeDefinition = {
  type: 'UTIL_TRANSFORM',
  category: 'UTILITY',
  label: 'Transform',
  description: 'Transform data format',
  iconName: 'RefreshCw',
  color: 'gray',
  inputs: [
    { name: 'input', type: 'any', label: 'Input', required: true },
  ],
  outputs: [
    { name: 'output', type: 'any', label: 'Output' },
  ],
  configFields: [
    {
      name: 'transformation',
      label: 'Transformation',
      type: 'select',
      options: [
        { value: 'toUpperCase', label: 'To Uppercase' },
        { value: 'toLowerCase', label: 'To Lowercase' },
        { value: 'trim', label: 'Trim Whitespace' },
        { value: 'parseJson', label: 'Parse JSON' },
        { value: 'stringify', label: 'Stringify' },
      ],
    },
  ],
};

export const UTIL_HTTP_REQUEST: NodeDefinition = {
  type: 'UTIL_HTTP_REQUEST',
  category: 'UTILITY',
  label: 'HTTP Request',
  description: 'Make HTTP API calls',
  iconName: 'Globe',
  color: 'gray',
  canBeTool: true,
  inputs: [
    { name: 'url', type: 'text', label: 'URL' },
    { name: 'pathParams', type: 'json', label: 'Path Params' },
    { name: 'query', type: 'json', label: 'Query Params' },
    { name: 'body', type: 'json', label: 'Request Body' },
  ],
  outputs: [
    { name: 'response', type: 'json', label: 'Response' },
    { name: 'status', type: 'any', label: 'Status Code' },
    { name: 'request', type: 'json', label: 'Request (debug)', hideHandle: true },
  ],
  configFields: [
    {
      name: 'url',
      label: 'URL',
      type: 'text',
      required: true,
      placeholder: 'https://api.example.com/endpoint',
    },
    {
      name: 'method',
      label: 'Method',
      type: 'select',
      options: [
        { value: 'GET', label: 'GET' },
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
        { value: 'PATCH', label: 'PATCH' },
        { value: 'DELETE', label: 'DELETE' },
      ],
      defaultValue: 'GET',
    },
    {
      name: 'headers',
      label: 'Headers',
      type: 'headers',
      description: 'Request headers sent with each call',
    },
  ],
};

export const UTIL_SCRIPT: NodeDefinition = {
  type: 'UTIL_SCRIPT',
  category: 'UTILITY',
  label: 'Script',
  description: 'Run custom JavaScript',
  iconName: 'Code',
  color: 'gray',
  canBeTool: true,
  inputs: [
    { name: 'input', type: 'any', label: 'Input' },
  ],
  outputs: [
    { name: 'output', type: 'any', label: 'Output' },
  ],
  configFields: [
    {
      name: 'code',
      label: 'JavaScript Code',
      type: 'textarea',
      placeholder: 'return input.toUpperCase();',
      description: 'Write JavaScript. Use "input" variable. Return result.',
    },
  ],
};

// ─── Desktop-only UTILITY nodes ─────────────────────────────────────────────

export const UTIL_CONDITIONAL: NodeDefinition = {
  type: 'UTIL_CONDITIONAL',
  category: 'UTILITY',
  label: 'Conditional',
  description: 'Route data based on a condition expression',
  iconName: 'GitBranch',
  color: 'gray',
  inputs: [
    { name: 'value', type: 'any', label: 'Value', required: true },
    { name: 'condition', type: 'text', label: 'Condition' },
  ],
  outputs: [
    { name: 'true', type: 'any', label: 'True' },
    { name: 'false', type: 'any', label: 'False' },
  ],
  configFields: [
    { name: 'condition', label: 'Condition Expression', type: 'text', placeholder: 'value > 0', description: 'JavaScript expression to evaluate' },
  ],
};

export const UTIL_FILE_SAVE: NodeDefinition = {
  type: 'UTIL_FILE_SAVE',
  category: 'UTILITY',
  label: 'File Save',
  description: 'Save data to a file path',
  iconName: 'FileOutput',
  color: 'gray',
  inputs: [
    { name: 'data', type: 'any', label: 'Data', required: true },
    { name: 'path', type: 'text', label: 'Path' },
  ],
  outputs: [{ name: 'url', type: 'text', label: 'File URL' }],
  configFields: [
    { name: 'path', label: 'File Path', type: 'text', placeholder: 'output/result.png' },
  ],
};

export const UTIL_FILE_LOAD: NodeDefinition = {
  type: 'UTIL_FILE_LOAD',
  category: 'UTILITY',
  label: 'File Load',
  description: 'Load data from a file path',
  iconName: 'FileInput',
  color: 'gray',
  inputs: [{ name: 'path', type: 'text', label: 'Path', required: true }],
  outputs: [{ name: 'data', type: 'any', label: 'Data' }],
  configFields: [
    { name: 'path', label: 'File Path', type: 'text', placeholder: 'input/image.png' },
  ],
};

export const UTIL_VARIABLE_SET: NodeDefinition = {
  type: 'UTIL_VARIABLE_SET',
  category: 'UTILITY',
  label: 'Set Variable',
  description: 'Store a value in a named variable',
  iconName: 'Variable',
  color: 'gray',
  inputs: [{ name: 'value', type: 'any', label: 'Value', required: true }],
  outputs: [{ name: 'value', type: 'any', label: 'Value' }],
  configFields: [
    { name: 'name', label: 'Variable Name', type: 'text', required: true, placeholder: 'myVariable' },
  ],
};

export const UTIL_VARIABLE_GET: NodeDefinition = {
  type: 'UTIL_VARIABLE_GET',
  category: 'UTILITY',
  label: 'Get Variable',
  description: 'Retrieve a value from a named variable',
  iconName: 'Variable',
  color: 'gray',
  inputs: [],
  outputs: [{ name: 'value', type: 'any', label: 'Value' }],
  configFields: [
    { name: 'name', label: 'Variable Name', type: 'text', required: true, placeholder: 'myVariable' },
  ],
};

export const UTIL_TEMPLATE: NodeDefinition = {
  type: 'UTIL_TEMPLATE',
  category: 'UTILITY',
  label: 'Template',
  description: 'Render a text template with dynamic data',
  iconName: 'FileText',
  color: 'gray',
  inputs: [
    { name: 'template', type: 'text', label: 'Template', required: true },
    { name: 'data', type: 'any', label: 'Data' },
  ],
  outputs: [{ name: 'result', type: 'text', label: 'Result' }],
  configFields: [
    { name: 'template', label: 'Template', type: 'textarea', placeholder: 'Hello {{name}}, your image is ready!', description: 'Use {{variable}} syntax for interpolation' },
  ],
};

// ─── Flow control (Phase 1 expansion) ───────────────────────────────────────
// These five nodes give workflows the expressiveness equivalent to n8n /
// Make / Zapier flow primitives that iris previously lacked.
//
// Existing 2-way primitives (`UTIL_CONDITION`, `UTIL_CONDITIONAL`) are kept
// for backward compatibility — new workflows should reach for the richer
// ROUTER / FILTER / TRY_CATCH variants below.

/**
 * Multi-way branch. Routes the input to the first route whose condition
 * matches; falls through to `default` if none do.
 *
 * Output ports beyond `default` are added at runtime based on the
 * `routes` config (currently a JSON textarea; future revision will swap
 * for a dedicated row-add UI in iris/ and iris-desktop/).
 */
export const UTIL_ROUTER: NodeDefinition = {
  type: 'UTIL_ROUTER',
  category: 'UTILITY',
  label: 'Router',
  description: 'Route input to the first matching branch (N-way)',
  iconName: 'Network',
  color: 'gray',
  inputs: [
    { name: 'input', type: 'any', label: 'Input', required: true },
  ],
  outputs: [
    // Runtime appends dynamic ports per `routes` entry; `default` is the
    // always-present fallback shown in the static catalog.
    { name: 'default', type: 'any', label: 'Default (No Match)' },
  ],
  configFields: [
    {
      name: 'routes',
      label: 'Routes',
      type: 'textarea',
      placeholder: '[{ "name": "high", "condition": "input.score > 0.8" }, { "name": "low", "condition": "input.score <= 0.3" }]',
      description: 'JSON array of { name, condition } — first match wins. Each entry becomes a dedicated output port.',
    },
  ],
};

/**
 * Pass-through on success, divert on miss. Useful inside loops to drop
 * items that don't satisfy a predicate without breaking the iteration.
 */
export const UTIL_FILTER: NodeDefinition = {
  type: 'UTIL_FILTER',
  category: 'UTILITY',
  label: 'Filter',
  description: 'Pass input through only when the condition matches',
  iconName: 'Filter',
  color: 'gray',
  inputs: [
    { name: 'input', type: 'any', label: 'Input', required: true },
  ],
  outputs: [
    { name: 'passed', type: 'any', label: 'Passed' },
    { name: 'rejected', type: 'any', label: 'Rejected' },
  ],
  configFields: [
    {
      name: 'condition',
      label: 'Condition Expression',
      type: 'text',
      required: true,
      placeholder: 'input.score > 0.5',
      description: 'JavaScript expression evaluated against `input`. Truthy → passed, falsy → rejected.',
    },
  ],
};

/**
 * Collect items emitted across loop iterations into a single output.
 * Receives one item per upstream `UTIL_LOOP` iteration, emits once when
 * the loop's `done` signal arrives. Runtime pairs this with the nearest
 * upstream `UTIL_LOOP` via graph traversal.
 */
export const UTIL_AGGREGATE: NodeDefinition = {
  type: 'UTIL_AGGREGATE',
  category: 'UTILITY',
  label: 'Aggregate',
  description: 'Collect loop iterations into a single array / object / string',
  iconName: 'Combine',
  color: 'gray',
  inputs: [
    { name: 'item', type: 'any', label: 'Item (per iteration)', required: true },
  ],
  outputs: [
    { name: 'collected', type: 'json', label: 'Collected' },
  ],
  configFields: [
    {
      name: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'array', label: 'Array (preserve order)' },
        { value: 'object', label: 'Object (by key)' },
        { value: 'concat', label: 'Concatenate (text)' },
      ],
      defaultValue: 'array',
    },
    {
      name: 'keyField',
      label: 'Key Field',
      type: 'text',
      placeholder: 'id',
      description: 'For "Object" mode — which property of each item to use as the key.',
      dependsOn: { field: 'mode', value: 'object' },
    },
    {
      name: 'separator',
      label: 'Separator',
      type: 'text',
      defaultValue: '\n',
      description: 'For "Concatenate" mode — string inserted between items.',
      dependsOn: { field: 'mode', value: 'concat' },
    },
  ],
};

/**
 * Wrap upstream work in an error boundary. When the producing chain
 * throws, the error payload routes to `error` instead of propagating
 * out of the workflow; `success` carries the value when things work.
 *
 * `retries` re-executes the failing producer with exponential backoff
 * before giving up and routing to `error`.
 */
export const UTIL_TRY_CATCH: NodeDefinition = {
  type: 'UTIL_TRY_CATCH',
  category: 'UTILITY',
  label: 'Try / Catch',
  description: 'Catch errors from upstream and route to an alternate output',
  iconName: 'ShieldAlert',
  color: 'gray',
  inputs: [
    { name: 'input', type: 'any', label: 'Input', required: true },
  ],
  outputs: [
    { name: 'success', type: 'any', label: 'Success' },
    { name: 'error', type: 'json', label: 'Error (message, stack, retryCount)' },
  ],
  configFields: [
    {
      name: 'retries',
      label: 'Retries',
      type: 'number',
      min: 0,
      max: 10,
      defaultValue: 0,
      description: 'Re-attempt the upstream computation N times before routing to `error`.',
    },
    {
      name: 'retryDelayMs',
      label: 'Initial Retry Delay (ms)',
      type: 'number',
      min: 0,
      max: 60000,
      defaultValue: 1000,
      description: 'Backoff base — doubled on each retry.',
    },
  ],
};

// ─── Data formatters (Phase 1 expansion) ───────────────────────────────────
// Regex / date / JSON-path operations are the most common building blocks
// across every workflow engine (Zapier Formatter, n8n built-ins, etc.).
// All three are marked canBeTool so agents can invoke them while reasoning.

/**
 * Regex match / extract / replace. Pattern can come from config or be
 * supplied dynamically via the `pattern` input port.
 */
export const UTIL_REGEX: NodeDefinition = {
  type: 'UTIL_REGEX',
  category: 'UTILITY',
  label: 'Regex',
  description: 'Match, extract, or replace text with regular expressions',
  iconName: 'Regex',
  color: 'gray',
  canBeTool: true,
  inputs: [
    { name: 'text', type: 'text', label: 'Text', required: true },
    { name: 'pattern', type: 'text', label: 'Pattern (override)' },
  ],
  outputs: [
    { name: 'matches', type: 'json', label: 'Matches (array)' },
    { name: 'firstMatch', type: 'text', label: 'First Match' },
    { name: 'replaced', type: 'text', label: 'Replaced Text' },
  ],
  configFields: [
    {
      name: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'match', label: 'Test (boolean via firstMatch presence)' },
        { value: 'extract', label: 'Extract all matches' },
        { value: 'replace', label: 'Replace matches' },
      ],
      defaultValue: 'extract',
    },
    {
      name: 'pattern',
      label: 'Pattern',
      type: 'text',
      placeholder: '\\b\\w+@\\w+\\.\\w+\\b',
      description: 'JavaScript-flavored regex. Overridden by `pattern` input port if connected.',
    },
    {
      name: 'flags',
      label: 'Flags',
      type: 'text',
      defaultValue: 'g',
      placeholder: 'gimsu',
      description: 'Standard JS regex flags (g = global, i = case-insensitive, m = multiline, s = dotall, u = unicode).',
    },
    {
      name: 'replacement',
      label: 'Replacement',
      type: 'text',
      placeholder: '$1 → captured group',
      description: 'Replacement string. Supports $1, $2, ... for capture groups.',
      dependsOn: { field: 'mode', value: 'replace' },
    },
  ],
};

/**
 * Date arithmetic and formatting. Operation determines which inputs are
 * consumed: `parse`/`format` use `date`; `add` uses `date` + `amount`;
 * `diff` uses `date` + `secondDate`; `now` uses none.
 */
export const UTIL_DATE: NodeDefinition = {
  type: 'UTIL_DATE',
  category: 'UTILITY',
  label: 'Date',
  description: 'Parse, format, add, or diff dates with timezone support',
  iconName: 'CalendarClock',
  color: 'gray',
  canBeTool: true,
  inputs: [
    { name: 'date', type: 'text', label: 'Date' },
    { name: 'secondDate', type: 'text', label: 'Second Date (for diff)' },
    { name: 'amount', type: 'any', label: 'Amount (for add)' },
  ],
  outputs: [
    { name: 'result', type: 'text', label: 'Result' },
    { name: 'iso', type: 'text', label: 'ISO 8601' },
    { name: 'unix', type: 'any', label: 'Unix (ms)' },
  ],
  configFields: [
    {
      name: 'operation',
      label: 'Operation',
      type: 'select',
      options: [
        { value: 'now', label: 'Now (current time)' },
        { value: 'parse', label: 'Parse → normalize' },
        { value: 'format', label: 'Format' },
        { value: 'add', label: 'Add amount' },
        { value: 'diff', label: 'Diff (date − secondDate)' },
      ],
      defaultValue: 'format',
    },
    {
      name: 'format',
      label: 'Output Format',
      type: 'text',
      defaultValue: 'YYYY-MM-DD HH:mm:ss',
      placeholder: 'YYYY-MM-DD or RFC3339, etc.',
      description: 'Day.js / dayjs-format tokens. Used by parse / format / now.',
    },
    {
      name: 'unit',
      label: 'Unit',
      type: 'select',
      options: [
        { value: 'ms', label: 'Milliseconds' },
        { value: 's', label: 'Seconds' },
        { value: 'm', label: 'Minutes' },
        { value: 'h', label: 'Hours' },
        { value: 'd', label: 'Days' },
        { value: 'w', label: 'Weeks' },
        { value: 'M', label: 'Months' },
        { value: 'y', label: 'Years' },
      ],
      defaultValue: 'd',
      description: 'Unit for add (amount × unit) and diff (result expressed in this unit).',
    },
    {
      name: 'timezone',
      label: 'Timezone (IANA)',
      type: 'text',
      placeholder: 'Asia/Seoul',
      description: 'Optional IANA timezone (e.g. UTC, Asia/Seoul). Defaults to system TZ.',
    },
  ],
};

/**
 * Extract a value from a JSON structure using a JSONPath-ish selector.
 * Path can come from config or override input. Supports dot/bracket
 * notation (`users[0].name`) and JSONPath (`$.users[*].name`).
 */
export const UTIL_JSON_PATH: NodeDefinition = {
  type: 'UTIL_JSON_PATH',
  category: 'UTILITY',
  label: 'JSON Path',
  description: 'Extract a value from JSON using JSONPath or dot-bracket notation',
  iconName: 'Braces',
  color: 'gray',
  canBeTool: true,
  inputs: [
    { name: 'data', type: 'json', label: 'Data', required: true },
    { name: 'path', type: 'text', label: 'Path (override)' },
  ],
  outputs: [
    { name: 'result', type: 'any', label: 'Result' },
    { name: 'found', type: 'any', label: 'Found (boolean)' },
  ],
  configFields: [
    {
      name: 'path',
      label: 'Path',
      type: 'text',
      placeholder: 'users[0].email   or   $.users[*].email',
      description: 'Dot/bracket path (first matching value) or JSONPath ($.…). Overridden by `path` input port if connected.',
    },
    {
      name: 'multiple',
      label: 'Return All Matches',
      type: 'toggle',
      defaultValue: false,
      description: 'When true, returns an array of every match (JSONPath wildcard semantics).',
    },
    {
      name: 'defaultValue',
      label: 'Default Value',
      type: 'text',
      placeholder: 'null',
      description: 'Returned when the path resolves to nothing (parsed as JSON if possible).',
    },
  ],
};

/**
 * Phase 2: 파일 내 키워드/정규식 검색. DOC_LONG_CONTEXT가 너무 비싸거나
 * 파일이 long-context 한도를 초과할 때의 가벼운 대안. 매칭 줄 + 주변
 * context를 반환해 LLM에게 "관련 부분만" 보여주는 용도.
 *
 * 에이전트 도구로 쓰면 grep + read 패턴 (Claude Code 스타일)을 워크플로우
 * 안에서 재현 가능. 정확도-비용 trade-off에서 비용 쪽 극단.
 */
export const DOC_GREP: NodeDefinition = {
  type: 'DOC_GREP',
  category: 'UTILITY',
  label: 'Document Grep',
  description: '파일 내에서 키워드/정규식 매칭 + 주변 컨텍스트 반환',
  iconName: 'TextSearch',
  color: 'gray',
  canBeTool: true,
  inputs: [
    { name: 'file', type: 'any', label: 'Document', required: true },
    { name: 'pattern', type: 'text', label: 'Pattern (override)' },
  ],
  outputs: [
    { name: 'matches', type: 'json', label: 'Matches [{line, text, context}]' },
    { name: 'count', type: 'any', label: 'Match Count', hideHandle: true },
    { name: 'firstMatch', type: 'text', label: 'First Match Snippet' },
  ],
  configFields: [
    {
      name: 'pattern',
      label: 'Pattern',
      type: 'text',
      placeholder: 'TODO|FIXME   or   \\b(error|fail)\\w*\\b',
      description: '리터럴 문자열 또는 정규식 (mode에 따라). `pattern` input이 우선.',
    },
    {
      name: 'mode',
      label: 'Mode',
      type: 'select',
      options: [
        { value: 'literal', label: 'Literal (case-insensitive)' },
        { value: 'regex', label: 'Regex' },
      ],
      defaultValue: 'literal',
    },
    {
      name: 'contextLines',
      label: 'Context Lines',
      type: 'number',
      min: 0,
      max: 20,
      defaultValue: 2,
      description: '매칭 라인 위/아래로 몇 줄까지 함께 반환할지.',
    },
    {
      name: 'maxMatches',
      label: 'Max Matches',
      type: 'number',
      min: 1,
      max: 500,
      defaultValue: 50,
      description: '결과 폭주 방지 상한.',
    },
  ],
};

/**
 * Execute another saved workflow as a single step. Enables modularization
 * — extract a reusable sub-routine (e.g. "generate-then-upscale") and
 * reference it from multiple parent workflows.
 *
 * `inputMapping` is a JSON object that maps THIS node's resolved input
 * payload onto the sub-workflow's trigger inputs.
 */
export const UTIL_SUB_WORKFLOW: NodeDefinition = {
  type: 'UTIL_SUB_WORKFLOW',
  category: 'UTILITY',
  label: 'Sub-Workflow',
  description: 'Execute another workflow as a step and return its output',
  iconName: 'Workflow',
  color: 'gray',
  canBeTool: true,
  inputs: [
    { name: 'input', type: 'any', label: 'Input' },
  ],
  outputs: [
    { name: 'output', type: 'any', label: 'Output' },
    { name: 'executionId', type: 'text', label: 'Execution ID', hideHandle: true },
  ],
  configFields: [
    {
      name: 'workflowId',
      label: 'Workflow ID',
      type: 'text',
      required: true,
      placeholder: 'wf_...',
      description: 'ID of the saved workflow to invoke.',
    },
    {
      name: 'inputMapping',
      label: 'Input Mapping',
      type: 'textarea',
      placeholder: '{ "prompt": "{{ input.text }}", "style": "vivid" }',
      description: 'Optional JSON mapping this node\'s input onto the sub-workflow\'s trigger fields. Empty = pass `input` through as-is.',
    },
    {
      name: 'wait',
      label: 'Wait for Completion',
      type: 'toggle',
      defaultValue: true,
      description: 'If off, returns immediately with `executionId` and runs the sub-workflow async.',
    },
  ],
};
