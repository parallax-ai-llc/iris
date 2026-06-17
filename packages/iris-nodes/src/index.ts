// Public surface for the iris-nodes package — single source of truth for
// workflow node definitions across iris/, iris-desktop/, server/, llm/, sdk/.

export type {
  NodeCategory,
  PortType,
  PortDefinition,
  ConfigFieldType,
  ConfigFieldDefinition,
  HeaderEntry,
  NodeDefinition,
} from './types.js';

export {
  ASPECT_RATIO_OPTIONS,
  CAMERA_ANGLE_OPTIONS,
  TTS_VOICE_OPTIONS,
  VOICE_OPTIONS,
  getVoicesForProvider,
} from './constants.js';

// Triggers
export {
  TRIGGER_MANUAL,
  TRIGGER_SCHEDULE,
  TRIGGER_WEBHOOK,
  TRIGGER_EVENT,
  TRIGGER_DIRECTORY,
  // Phase 3: 진입점 다양화
  TRIGGER_CHAT,
  TRIGGER_FORM,
  TRIGGER_EMAIL_RECEIVED,
} from './nodes/trigger.js';

// Generators
export {
  GEN_TEXT_TO_TEXT,
  GEN_TEXT_TO_IMAGE,
  GEN_IMAGE_TO_IMAGE,
  GEN_TEXT_TO_VIDEO,
  GEN_IMAGE_TO_VIDEO,
  GEN_TEXT_TO_SPEECH,
  GEN_SPEECH_TO_TEXT,
  GEN_VIDEO_SUBTITLE,
  GEN_TEXT_TO_MUSIC,
  GEN_INPAINT,
  GEN_OUTPAINT,
  GEN_STYLE_TRANSFER,
  GEN_FACE_SWAP,
  // Phase 3: 미디어 생성 보강
  GEN_LIP_SYNC,
} from './nodes/generator.js';

// Analyzers
export {
  ANALYZE_IMAGE,
  ANALYZE_VIDEO,
  ANALYZE_TEXT,
  ANALYZE_AUDIO,
  ANALYZE_DOCUMENT,
  // Phase 2: RAG 대안 + 구조화 LLM 호출
  DOC_LONG_CONTEXT,
  AI_STRUCTURED_EXTRACT,
  AI_CATEGORIZE,
} from './nodes/analyzer.js';

// Editors
export {
  EDIT_MOTION_CONTROL,
  EDIT_IMAGE_UPSCALE,
  EDIT_IMAGE_INPAINT,
  EDIT_IMAGE_OUTPAINT,
  EDIT_IMAGE_STYLE,
  EDIT_IMAGE_FACE_SWAP,
  EDIT_IMAGE_BG_REMOVE,
  EDIT_VIDEO_UPSCALE,
  EDIT_VIDEO_INPAINT,
  EDIT_IMAGE_SKY_REPLACE,
  EDIT_IMAGE_RELIGHT,
  EDIT_IMAGE_AUTO_ENHANCE,
  EDIT_IMAGE_CROP,
  EDIT_IMAGE_FILTER,
  EDIT_VIDEO_TRIM,
  EDIT_VIDEO_CROP,
  EDIT_AUDIO_TRIM,
  EDIT_MASK_DEFINE,
  // Phase 3: 미디어 보강
  EDIT_AUDIO_SEPARATE,
  EDIT_VIDEO_MERGE,
  EDIT_VIDEO_OVERLAY,
} from './nodes/editor.js';

// Utilities
export {
  UTIL_DELAY,
  UTIL_CONDITION,
  UTIL_LOOP,
  UTIL_MERGE,
  UTIL_SPLIT,
  UTIL_TRANSFORM,
  UTIL_HTTP_REQUEST,
  UTIL_SCRIPT,
  UTIL_CONDITIONAL,
  UTIL_FILE_SAVE,
  UTIL_FILE_LOAD,
  UTIL_VARIABLE_SET,
  UTIL_VARIABLE_GET,
  UTIL_TEMPLATE,
  // Phase 1 flow control
  UTIL_ROUTER,
  UTIL_FILTER,
  UTIL_AGGREGATE,
  UTIL_TRY_CATCH,
  UTIL_SUB_WORKFLOW,
  // Phase 1 data formatters
  UTIL_REGEX,
  UTIL_DATE,
  UTIL_JSON_PATH,
  // Phase 2
  DOC_GREP,
} from './nodes/utility.js';

// Web data collection (Phase 1+)
export {
  WEB_SEARCH,
  // Phase 2
  WEB_SCRAPER,
  WEB_YOUTUBE_TRANSCRIPT,
} from './nodes/web.js';

// Outputs
export {
  OUTPUT_STORAGE,
  OUTPUT_WEBHOOK,
  OUTPUT_EMAIL,
  OUTPUT_NOTIFICATION,
  // Phase 3: 통합 출력 확장
  OUTPUT_SLACK_POST,
  OUTPUT_SHEET_APPEND,
} from './nodes/output.js';

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

// Re-export prompt helpers so consumers can import from the main entry,
// avoiding subpath-export resolution issues in tsconfigs that aren't
// set to moduleResolution: 'node16' | 'nodenext' | 'bundler'.
export {
  renderNodePromptSection,
  renderNodePromptSections,
  renderAllMigratedNodePrompts,
  renderCategorizedNodePrompts,
  renderWorkflowPatterns,
} from './prompt.js';

export { buildSnapshot } from './snapshot.js';
export type {
  Snapshot,
  SnapshotNode,
  SnapshotPort,
  SnapshotConfigField,
} from './snapshot.js';
