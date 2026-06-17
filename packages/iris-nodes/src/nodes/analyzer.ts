import type { NodeDefinition } from '../types.js';

export const ANALYZE_IMAGE: NodeDefinition = {
  type: 'ANALYZE_IMAGE',
  category: 'ANALYZER',
  label: 'Image Analyzer',
  description: 'Analyze and describe images',
  iconName: 'Eye',
  color: 'blue',
  aiCapability: 'image-analysis',
  inputs: [
    { name: 'image', type: 'image', label: 'Image', required: true },
    { name: 'prompt', type: 'text', label: 'Question' },
  ],
  outputs: [
    { name: 'description', type: 'text', label: 'Description' },
    { name: 'tags', type: 'json', label: 'Tags' },
  ],
  configFields: [
    {
      name: 'analysisType',
      label: 'Analysis Type',
      type: 'select',
      options: [
        { value: 'describe', label: 'General Description' },
        { value: 'objects', label: 'Object Detection' },
        { value: 'text', label: 'Text Extraction (OCR)' },
        { value: 'custom', label: 'Custom Query' },
      ],
      defaultValue: 'describe',
    },
  ],
};

export const ANALYZE_VIDEO: NodeDefinition = {
  type: 'ANALYZE_VIDEO',
  category: 'ANALYZER',
  label: 'Video Analyzer',
  description: 'Analyze video content',
  iconName: 'Eye',
  color: 'blue',
  aiCapability: 'video-analysis',
  inputs: [
    { name: 'video', type: 'video', label: 'Video', required: true },
    { name: 'prompt', type: 'text', label: 'Question' },
  ],
  outputs: [
    { name: 'description', type: 'text', label: 'Description' },
    { name: 'keyFrames', type: 'json', label: 'Key Frames' },
  ],
  configFields: [
    {
      name: 'sampleRate',
      label: 'Frame Sample Rate',
      type: 'select',
      options: [
        { value: '1', label: 'Every frame' },
        { value: '5', label: 'Every 5 frames' },
        { value: '10', label: 'Every 10 frames' },
        { value: '30', label: 'Every second (30fps)' },
      ],
      defaultValue: '10',
    },
  ],
};

export const ANALYZE_TEXT: NodeDefinition = {
  type: 'ANALYZE_TEXT',
  category: 'ANALYZER',
  label: 'Text Analyzer',
  description: 'Analyze text content',
  iconName: 'FileText',
  color: 'blue',
  inputs: [
    { name: 'text', type: 'text', label: 'Text', required: true },
  ],
  outputs: [
    { name: 'analysis', type: 'json', label: 'Analysis' },
    { name: 'summary', type: 'text', label: 'Summary' },
  ],
  configFields: [
    {
      name: 'analysisType',
      label: 'Analysis Type',
      type: 'select',
      options: [
        { value: 'sentiment', label: 'Sentiment Analysis' },
        { value: 'entities', label: 'Entity Extraction' },
        { value: 'summary', label: 'Summarization' },
        { value: 'keywords', label: 'Keyword Extraction' },
      ],
      defaultValue: 'summary',
    },
  ],
};

export const ANALYZE_AUDIO: NodeDefinition = {
  type: 'ANALYZE_AUDIO',
  category: 'ANALYZER',
  label: 'Audio Analyzer',
  description: 'Transcribe and analyze audio content using Whisper + GPT',
  iconName: 'AudioWaveform',
  color: 'blue',
  inputs: [
    { name: 'audio', type: 'audio', label: 'Audio', required: true },
  ],
  outputs: [
    { name: 'transcription', type: 'text', label: 'Transcription' },
    { name: 'analysis', type: 'text', label: 'Analysis' },
  ],
  configFields: [
    {
      name: 'prompt',
      type: 'textarea',
      label: 'Analysis Prompt',
      description: 'Instructions for analyzing the transcribed audio',
      placeholder: 'e.g., Summarize the key points, identify speakers, detect sentiment...',
    },
    {
      name: 'model',
      type: 'select',
      label: 'Analysis Model',
      options: [
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' },
        { value: 'gpt-4o', label: 'GPT-4o (Best)' },
      ],
      defaultValue: 'gpt-4o-mini',
    },
  ],
};

export const ANALYZE_DOCUMENT: NodeDefinition = {
  type: 'ANALYZE_DOCUMENT',
  category: 'ANALYZER',
  label: 'Document Analyzer',
  description: 'Analyze documents using GPT-4o vision (PDF pages, scanned documents, images)',
  iconName: 'FileSearch',
  color: 'blue',
  inputs: [
    { name: 'document', type: 'image', label: 'Document Image', required: true },
    { name: 'query', type: 'text', label: 'Query' },
  ],
  outputs: [
    { name: 'analysis', type: 'text', label: 'Analysis' },
  ],
  configFields: [
    {
      name: 'prompt',
      type: 'textarea',
      label: 'Analysis Prompt',
      description: 'Instructions for analyzing the document',
      placeholder: 'e.g., Extract all dates and amounts, summarize key points...',
    },
    {
      name: 'model',
      type: 'select',
      label: 'Model',
      options: [
        { value: 'gpt-4o', label: 'GPT-4o (Best)' },
        { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Fast)' },
      ],
      defaultValue: 'gpt-4o',
    },
  ],
};

// ─── Phase 2: RAG 대안 + 구조화 LLM 호출 ────────────────────────────────────
// 업계 RAG 회의론 (Long context + agentic search 우세) 시대에 맞춰 자체 벡터
// DB 운영을 피하고 "외부에 떠넘기는" 접근. 자세한 설계 사유는
// docs/plan/IRIS_NODES_EXPANSION_PLAN.md §5.1 참조.

/**
 * 파일 통째 + prompt cache로 문서 Q&A. RAG 청킹/임베딩/벡터 DB 없이
 * Claude 1M / Gemini 2M 같은 long-context 모델 + provider-side cache로
 * 비용을 분산. 동일 파일 반복 질의 시 cache hit로 ~90% 절감.
 *
 * 적합: ~500K 토큰 (대략 300페이지) 이하 문서 단일 Q&A.
 * 부적합: 다중 문서 검색 (그땐 외부 검색 → DOC_LONG_CONTEXT 조합),
 *         자주 변하는 코퍼스 (cache invalidation 부담).
 */
export const DOC_LONG_CONTEXT: NodeDefinition = {
  type: 'DOC_LONG_CONTEXT',
  category: 'ANALYZER',
  label: 'Long-Context Document Q&A',
  description: '파일 통째를 long-context 모델에 주입하여 질의응답 (RAG 대체)',
  iconName: 'BookOpen',
  color: 'blue',
  aiCapability: 'long-context-qa',
  canBeTool: true,
  inputs: [
    { name: 'file', type: 'any', label: 'Document', required: true },
    { name: 'query', type: 'text', label: 'Query', required: true },
  ],
  outputs: [
    { name: 'answer', type: 'text', label: 'Answer' },
    { name: 'cached', type: 'any', label: 'Cache Hit', hideHandle: true },
    { name: 'inputTokens', type: 'any', label: 'Input Tokens', hideHandle: true },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'systemPrompt',
      label: 'System Prompt',
      type: 'textarea',
      placeholder: 'Answer based solely on the attached document. Say "not in document" if unsure.',
      description: '안전한 답변 유도용 (hallucination 억제).',
    },
    {
      name: 'enableCache',
      label: 'Enable Prompt Cache',
      type: 'toggle',
      defaultValue: true,
      description: 'Provider의 prompt cache 사용 (Anthropic ephemeral / Gemini implicit). 동일 파일 반복 질의 시 비용 ~90% 절감.',
    },
    {
      name: 'temperature',
      label: 'Temperature',
      type: 'slider',
      min: 0,
      max: 1,
      step: 0.1,
      defaultValue: 0.2,
      description: '문서 Q&A는 낮은 temperature가 정확도 ↑.',
    },
  ],
};

/**
 * 입력을 임의 JSON Schema로 구조화 추출. Instructor / OpenAI structured
 * output / Gemini JSON mode 같은 provider 기능을 통합 래핑. 단순 free-text
 * generation과 분리한 이유: 출력 포트 타입이 json으로 다르고, schema config가
 * 별도 UI 요건이라 GEN_TEXT_TO_TEXT mode 확장으로 흡수하기엔 어색.
 */
export const AI_STRUCTURED_EXTRACT: NodeDefinition = {
  type: 'AI_STRUCTURED_EXTRACT',
  category: 'ANALYZER',
  label: 'Structured Extract',
  description: 'JSON Schema에 맞춰 입력에서 구조화된 데이터 추출',
  iconName: 'Braces',
  color: 'blue',
  aiCapability: 'structured-extraction',
  canBeTool: true,
  inputs: [
    { name: 'input', type: 'any', label: 'Input', required: true },
    { name: 'schema', type: 'json', label: 'Schema (override)' },
  ],
  outputs: [
    { name: 'data', type: 'json', label: 'Extracted Data' },
    { name: 'rawText', type: 'text', label: 'Raw LLM Output', hideHandle: true },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'schema',
      label: 'JSON Schema',
      type: 'textarea',
      placeholder: '{ "type": "object", "properties": { "name": {"type": "string"}, "email": {"type": "string"} }, "required": ["name"] }',
      description: 'JSON Schema (draft-07). `schema` input 포트가 연결되면 그쪽이 우선.',
    },
    {
      name: 'instruction',
      label: 'Extraction Instruction',
      type: 'textarea',
      placeholder: 'Extract the customer name and email from this support ticket.',
      description: 'LLM에게 어떤 데이터를 뽑을지 지시. schema가 self-explanatory면 빈 값도 OK.',
    },
    {
      name: 'strict',
      label: 'Strict Mode',
      type: 'toggle',
      defaultValue: true,
      description: 'true면 schema에 안 맞는 응답은 에러 — false면 best-effort 파싱.',
    },
  ],
};

/**
 * 입력을 N개 라벨 중 하나(또는 여러)로 분류. AI_STRUCTURED_EXTRACT의
 * 특수 케이스이지만 categorization 사용 빈도가 높아 dedicated 노드로 분리.
 */
export const AI_CATEGORIZE: NodeDefinition = {
  type: 'AI_CATEGORIZE',
  category: 'ANALYZER',
  label: 'Categorize',
  description: '입력을 미리 정의한 카테고리 중 하나(또는 여러)로 분류',
  iconName: 'Tags',
  color: 'blue',
  aiCapability: 'classification',
  canBeTool: true,
  inputs: [
    { name: 'input', type: 'text', label: 'Input', required: true },
  ],
  outputs: [
    { name: 'category', type: 'text', label: 'Category' },
    { name: 'categories', type: 'json', label: 'All Categories (multi-label)' },
    { name: 'confidence', type: 'any', label: 'Confidence (0~1)', hideHandle: true },
  ],
  configFields: [
    { name: 'provider', label: 'Provider', type: 'provider', required: true },
    { name: 'model', label: 'Model', type: 'model', required: true },
    {
      name: 'categories',
      label: 'Categories',
      type: 'textarea',
      required: true,
      placeholder: 'bug, feature_request, question, complaint',
      description: '콤마 또는 줄바꿈으로 구분. 각 라벨은 짧고 명확하게.',
    },
    {
      name: 'descriptions',
      label: 'Category Descriptions (optional)',
      type: 'textarea',
      placeholder: 'bug: 동작이 의도와 다름\nfeature_request: 새 기능 요청\n...',
      description: '카테고리별 정의 (key: value 형태) — 정확도 향상 시 권장.',
    },
    {
      name: 'allowMultiple',
      label: 'Multi-Label',
      type: 'toggle',
      defaultValue: false,
      description: 'true면 여러 카테고리 동시 선택 가능 (`categories` 출력 사용).',
    },
    {
      name: 'allowNone',
      label: 'Allow "Uncategorized"',
      type: 'toggle',
      defaultValue: false,
      description: 'true면 어느 카테고리도 안 맞으면 빈 값 반환 — false면 가장 가까운 카테고리 강제.',
    },
  ],
};
