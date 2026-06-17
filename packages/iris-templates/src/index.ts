/**
 * iris-templates — single source of truth for Iris workflow templates.
 *
 * Preset workflow graphs (nodes + edges) + metadata, shared by iris/web and
 * iris/desktop. Locale messages (template names/descriptions) are exposed as
 * JSON via the `iris-templates/lang/<locale>` subpath exports.
 */

export type {
  TemplateNode,
  TemplateEdge,
  WorkflowTemplateMeta,
  PresetTemplate,
  BlankTemplateMeta,
} from './types.js';

export {
  PRESET_TEMPLATES,
  BLANK_TEMPLATE,
  categoryColors,
  NODE_LABEL_I18N_KEYS,
  INPUT_LABEL_I18N_KEYS,
  getModelLogo,
} from './presets.js';
