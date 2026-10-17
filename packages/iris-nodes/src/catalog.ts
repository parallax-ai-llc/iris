// Full node catalog (split out of index.ts so pure helpers in this package can
// default to it without an import cycle).

import type { NodeDefinition } from './types.js';
import * as trigger from './nodes/trigger.js';
import * as generator from './nodes/generator.js';
import * as analyzer from './nodes/analyzer.js';
import * as editor from './nodes/editor.js';
import * as utility from './nodes/utility.js';
import * as web from './nodes/web.js';
import * as output from './nodes/output.js';

/**
 * Full canonical catalog. Every node defined in iris-nodes is keyed here.
 * Individual consumers may opt-in to a subset (e.g. iris/ excludes some
 * desktop-only nodes from its picker) but the definitions live here.
 */
export const NODE_DEFINITIONS: Record<string, NodeDefinition> = {
  ...trigger,
  ...generator,
  ...analyzer,
  ...editor,
  ...utility,
  ...web,
  ...output,
};

export function getNodeDefinition(type: string): NodeDefinition | undefined {
  return NODE_DEFINITIONS[type];
}
