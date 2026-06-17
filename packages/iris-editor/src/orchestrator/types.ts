import { Workflow as WorkflowType, TokenCostsResponse } from '@editor/lib/apis/iris-api-client';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface ConfirmDialogState {
  isOpen: boolean;
  type: 'save' | 'execute';
}

export interface ManualTriggerConfig {
  inputType: 'none' | 'text' | 'image' | 'file';
  inputLabel: string;
}

export interface UserInput {
  type: 'none' | 'text' | 'image' | 'file';
  value: string;
  file?: File;
}

export interface WorkflowEditorState {
  workflow: WorkflowType | null;
  isLoading: boolean;
  isSaving: boolean;
  isValidating: boolean;
  validationResult: ValidationResult | null;
  isValidated: boolean;
  tokenCosts: TokenCostsResponse | null;
  confirmDialog: ConfirmDialogState;
  showInputModal: boolean;
}

export interface PanelState {
  isMobile: boolean;
  showLeftPanel: boolean;
  showRightPanel: boolean;
  mobileMenuOpen: boolean;
}

// Helper to get category from node type
export function getCategoryFromType(type: string): string {
  if (type.startsWith('TRIGGER_')) return 'TRIGGER';
  if (type.startsWith('GEN_')) return 'GENERATOR';
  if (type.startsWith('ANALYZE_')) return 'ANALYZER';
  if (type.startsWith('EDIT_')) return 'EDITOR';
  if (type.startsWith('UTIL_')) return 'UTILITY';
  if (type.startsWith('OUTPUT_')) return 'OUTPUT';
  return 'UTILITY';
}

export const VIDEO_NODE_TYPES = ['GEN_TEXT_TO_VIDEO', 'GEN_IMAGE_TO_VIDEO'];
