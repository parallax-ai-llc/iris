import { InputConfig, InputSourceType } from '@editor/store/iris-editor';
import { PortType } from '../../../../constants/node-definitions';

export interface InputSourceSelectorProps {
  nodeId: string;
  inputName: string;
  inputLabel: string;
  inputType: PortType;
  inputConfig: InputConfig | undefined;
  required?: boolean;
  disabled?: boolean;
  disabledReason?: string;
}

export interface AvailableOutput {
  nodeId: string;
  nodeName: string;
  outputName: string;
  outputLabel: string;
  type: PortType;
}

export interface ConnectedNodeInfo {
  nodeId: string;
  nodeName: string;
  outputName: string;
  outputLabel: string;
}

export interface SourceTypeButtonProps {
  source: InputSourceType;
  currentSource: InputSourceType;
  onClick: () => void;
  disabled?: boolean;
  icon: React.ReactNode;
  label: string;
}

export interface UserInputContentProps {
  inputType: PortType;
  inputLabel: string;
  value: string;
  onChange: (value: string) => void;
}

export interface NodeInputContentProps {
  availableOutputs: AvailableOutput[];
  currentNodeRef: string | undefined;
  currentOutputRef: string | undefined;
  onNodeRefChange: (nodeId: string, outputName: string) => void;
}

export interface StorageInputContentProps {
  inputType: PortType;
  storageAssetId: string | undefined;
  displayValue: string | undefined;
  onStorageSelect: (path: string, name: string) => void;
  onClearSelection: () => void;
}

export interface UrlInputContentProps {
  inputType: PortType;
  value: string;
  onChange: (value: string) => void;
}

export interface ConnectedNodeIndicatorProps {
  nodeName: string;
  outputLabel: string;
}
