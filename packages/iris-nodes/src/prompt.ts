import type { NodeDefinition } from './types.js';
import { NODE_DEFINITIONS } from './index.js';

/**
 * Render the LLM-facing markdown spec for a single node.
 * Used by llm/ to compose the workflow-generation system prompt from the
 * same definitions the editor uses, so the LLM cannot drift from reality.
 */
export function renderNodePromptSection(node: NodeDefinition, index?: number): string {
  const heading = index != null ? `${index}. ` : '';
  const lines: string[] = [];

  lines.push(`${heading}**${node.type}** - ${node.label}`);
  lines.push(`   - Description: ${node.description}`);

  if (node.inputs.length > 0) {
    const inputs = node.inputs
      .map((p) => `${p.name} (${p.type}${p.required ? ', required' : ''})`)
      .join(', ');
    lines.push(`   - Inputs: ${inputs}`);
  } else {
    lines.push(`   - Inputs: none`);
  }

  if (node.outputs.length > 0) {
    const outputs = node.outputs.map((p) => p.name).join(', ');
    lines.push(`   - Outputs: ${outputs}`);
  }

  if (node.configFields.length > 0) {
    lines.push(`   - Config:`);
    for (const field of node.configFields) {
      const required = field.required ? ' (required)' : '';
      const opts = field.options ? ` (${field.options.map((o) => o.value).join('|')})` : '';
      const def = field.defaultValue !== undefined ? `, default: ${JSON.stringify(field.defaultValue)}` : '';
      const desc = field.description ? ` — ${field.description}` : '';
      lines.push(`     - ${field.name}${required}${opts}${def}: ${renderFieldTypeHint(field.type)}${desc}`);
    }
  }

  // Custom hints per field type that needs more guidance than the bare type name.
  const hasHeaders = node.configFields.some((f) => f.type === 'headers');
  if (hasHeaders) {
    lines.push(
      `   - Headers format: array of \`{ "key": string, "value": string, "enabled"?: boolean }\` entries (order preserved; set "enabled": false to keep but skip). Legacy object form \`{ "Header-Name": "value" }\` is still accepted. The executor adds \`Content-Type: application/json\` automatically — only override when intentional.`,
    );
    lines.push(
      `   - Headers example: \`"headers": [{"key":"Authorization","value":"Bearer {{token}}"},{"key":"Accept","value":"application/json"}]\``,
    );
  }

  return lines.join('\n');
}

function renderFieldTypeHint(type: string): string {
  switch (type) {
    case 'headers':
      return 'array of header entries';
    case 'json':
      return 'JSON object';
    case 'select':
      return 'enum';
    case 'toggle':
      return 'boolean';
    default:
      return type;
  }
}

/**
 * Render the spec for a list of nodes. Pass a starting index so the headings
 * line up with the rest of the prompt's numbering.
 */
export function renderNodePromptSections(
  nodes: NodeDefinition[],
  startIndex: number = 1,
): string {
  return nodes
    .map((node, i) => renderNodePromptSection(node, startIndex + i))
    .join('\n\n');
}

/**
 * Convenience helpers for the currently-migrated catalog.
 */
export function renderAllMigratedNodePrompts(startIndex: number = 1): string {
  return renderNodePromptSections(Object.values(NODE_DEFINITIONS), startIndex);
}

const CATEGORY_HEADER: Record<string, string> = {
  TRIGGER: '### TRIGGER Nodes (Category: TRIGGER, Color: green)',
  GENERATOR: '### GENERATOR Nodes (Category: GENERATOR, Color: purple)',
  ANALYZER: '### ANALYZER Nodes (Category: ANALYZER, Color: blue)',
  EDITOR: '### EDITOR Nodes (Category: EDITOR, Color: orange)',
  UTILITY: '### UTILITY Nodes (Category: UTILITY, Color: gray)',
  OUTPUT: '### OUTPUT Nodes (Category: OUTPUT, Color: teal)',
};

const CATEGORY_ORDER = ['TRIGGER', 'GENERATOR', 'ANALYZER', 'EDITOR', 'UTILITY', 'OUTPUT'] as const;

/**
 * Render the entire catalog as markdown grouped by category, with sequential
 * numbering across categories — matches the hand-written shape the workflow
 * generation prompt previously used.
 *
 * Pass `nodeTypes` to restrict to a subset (e.g. only nodes the server can
 * actually execute). Defaults to every node in NODE_DEFINITIONS.
 */
export function renderCategorizedNodePrompts(options?: {
  nodeTypes?: readonly string[];
}): string {
  const allDefs = options?.nodeTypes
    ? options.nodeTypes
        .map((t) => NODE_DEFINITIONS[t])
        .filter((d): d is NodeDefinition => !!d)
    : Object.values(NODE_DEFINITIONS);

  const sections: string[] = [];
  let counter = 1;

  for (const category of CATEGORY_ORDER) {
    const nodesInCategory = allDefs.filter((n) => n.category === category);
    if (nodesInCategory.length === 0) continue;

    sections.push(CATEGORY_HEADER[category]);
    sections.push('');
    for (const node of nodesInCategory) {
      sections.push(renderNodePromptSection(node, counter));
      sections.push('');
      counter++;
    }
  }

  return sections.join('\n').trimEnd();
}

/**
 * Markdown section listing common workflow construction patterns the LLM
 * must follow when stitching nodes together. These are runtime contracts
 * (string vs object port values, executor body handling, etc.) that aren't
 * obvious from the per-node spec alone — adding them eliminates a class of
 * "looks right but doesn't run" workflows the LLM otherwise produces.
 */
export function renderWorkflowPatterns(): string {
  return `## Workflow Construction Patterns

These are non-obvious runtime rules. Follow them when stitching nodes — the
node-level spec alone won't tell you these.

### Pattern 1 — Structured data into HTTP request body (almost always required)

The \`UTIL_HTTP_REQUEST\` body input must receive a **JavaScript object**,
not a JSON string. The executor calls \`JSON.stringify\` on whatever it
receives, so a string input becomes a double-encoded blob like
\`"\\"{\\\\\"text\\\\\":\\\\\"x\\\\\"}\\""\` and any structured API (Notion,
Stripe, Slack, etc.) rejects it with 400 validation_error.

**Rule of thumb:** whenever the upstream port produces a string (manual
trigger \`text\`/\`prompt\`, \`UTIL_TEMPLATE.result\`, \`GEN_TEXT_TO_TEXT.text\`,
etc.) and that data is going into an HTTP request body, **insert a
\`UTIL_TRANSFORM\` with \`transformation: "parseJson"\` between them.**

Required edges:
  - <text source>.<text-port>  ->  UTIL_TRANSFORM.input
  - UTIL_TRANSFORM.output       ->  UTIL_HTTP_REQUEST.body

Skip the transform only when the upstream port already produces an object —
specifically:
  - \`TRIGGER_WEBHOOK.payload\` (already parsed by the executor)
  - another \`UTIL_HTTP_REQUEST.response\` that the executor auto-parsed
  - \`UTIL_TRANSFORM.output\` already

### Pattern 2 — Manual trigger payloads are strings

\`TRIGGER_MANUAL\`'s \`text\` and \`prompt\` output ports always carry a
**raw string**, even when the user typed JSON like \`{"foo": "bar"}\` into
the inputValue. The trigger does NOT auto-parse; downstream nodes see the
literal string \`'{"foo":"bar"}'\`. Use \`UTIL_TRANSFORM\` with \`parseJson\`
to lift it into an object before any structured use.

### Pattern 3 — UTIL_TEMPLATE returns a string

\`UTIL_TEMPLATE\` interpolates \`{{variable}}\` placeholders and returns a
**string** (output port \`result\`). If you template a JSON shape and then
need it as an object (e.g. to feed an HTTP body), chain a \`UTIL_TRANSFORM\`
with \`parseJson\` after the template.

Common template-then-post pattern:
  TRIGGER_MANUAL.text -> UTIL_TEMPLATE.data -> UTIL_TRANSFORM(parseJson) -> UTIL_HTTP_REQUEST.body

### Pattern 4 — HTTP request URL templating

\`UTIL_HTTP_REQUEST.url\` supports \`{{token}}\` placeholders that are filled
from the connected \`pathParams\` and \`query\` inputs (path params take
precedence). When the URL has exactly one \`{{token}}\` and \`pathParams\` or
\`query\` receives a single scalar, that scalar replaces the token. So you
can drive a path parameter without building an object — just connect a
string output to \`pathParams\` and write \`{{id}}\` in the URL.

### Pattern 5 — Required headers for popular APIs

For HTTP requests, generate headers as the array form (the executor accepts
both object and array; prefer the array because it's the editor-native shape):
  - Notion:  \`[{"key":"Authorization","value":"Bearer {{NOTION_TOKEN}}"},{"key":"Notion-Version","value":"2022-06-28"}]\`
  - OpenAI:  \`[{"key":"Authorization","value":"Bearer {{OPENAI_KEY}}"}]\`
  - Slack:   \`[{"key":"Authorization","value":"Bearer {{SLACK_TOKEN}}"}]\`

\`Content-Type: application/json\` is added by the executor automatically;
do NOT include it unless you mean to override.

### Pattern 6 — Webhook output URL templating

Same {{token}} substitution applies to \`OUTPUT_WEBHOOK.url\` so the URL can
parameterize on upstream data.`;
}
