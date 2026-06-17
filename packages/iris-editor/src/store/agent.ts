// Agent/model store seam — the editor's ModelSelector reads available models
// from here. The host provides the list (iris/web's real agent store; a static
// BYOK list in the local host). `AgentModel` mirrors iris/web's type exactly.
import { useSeams } from '@editor/seams';

export interface AgentModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  alias?: string;
  contextWindow?: number;
  maxOutputTokens?: number;
  knowledgeCutoff?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pricing?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  modalities?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  endpoints?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  features?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any;
  chat: boolean;
  imageGeneration: boolean;
  videoGeneration: boolean;
  imageRequired?: boolean;
  supportedDurations?: number[];
  webSearch: boolean;
  isFreeUserAccessible: boolean;
  isFast: boolean;
  isExpert: boolean;
  greetingMessage?: string;
  language?: string;
  description?: string;
  profileImageThumbnail?: string;
  category?: string;
  createdAt: string;
  updatedAt: string;
}

export function useAgentStore() {
  return useSeams().useModels();
}
