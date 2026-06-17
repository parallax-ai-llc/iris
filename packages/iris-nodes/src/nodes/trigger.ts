import type { NodeDefinition } from '../types.js';

export const TRIGGER_MANUAL: NodeDefinition = {
  type: 'TRIGGER_MANUAL',
  category: 'TRIGGER',
  label: 'Manual Trigger',
  description: 'Start workflow manually with user input',
  iconName: 'Zap',
  color: 'green',
  inputs: [],
  outputs: [
    { name: 'trigger', type: 'trigger', label: 'Trigger' },
    { name: 'text', type: 'text', label: 'Input Text' },
    { name: 'image', type: 'image', label: 'Input Image' },
    { name: 'file', type: 'any', label: 'Input File' },
  ],
  configFields: [
    {
      name: 'inputType',
      label: 'Input Type',
      type: 'select',
      options: [
        { value: 'none', label: 'None (Signal Only)' },
        { value: 'text', label: 'Text' },
        { value: 'image', label: 'Image Upload' },
        { value: 'file', label: 'File Upload' },
      ],
      defaultValue: 'text',
    },
    {
      name: 'inputLabel',
      label: 'Input Label',
      type: 'text',
      placeholder: 'Enter your prompt...',
    },
  ],
};

export const TRIGGER_SCHEDULE: NodeDefinition = {
  type: 'TRIGGER_SCHEDULE',
  category: 'TRIGGER',
  label: 'Schedule Trigger',
  description: 'Run workflow on a schedule with static input',
  iconName: 'Clock',
  color: 'green',
  inputs: [],
  outputs: [
    { name: 'trigger', type: 'trigger', label: 'Trigger' },
    { name: 'text', type: 'text', label: 'Input Text' },
    { name: 'image', type: 'image', label: 'Input Image' },
  ],
  configFields: [
    {
      name: 'inputType',
      label: 'Input Type',
      type: 'select',
      options: [
        { value: 'none', label: 'None' },
        { value: 'text', label: 'Text' },
        { value: 'image', label: 'Image URL' },
      ],
      defaultValue: 'text',
    },
    {
      name: 'inputValue',
      label: 'Input Value',
      type: 'textarea',
      placeholder: 'Enter text prompt or image URL...',
      description: 'Static value to pass to connected nodes',
    },
    {
      name: 'concurrencyPolicy',
      label: 'If Previous Run Still Active',
      type: 'select',
      options: [
        { value: 'skip', label: 'Skip new run (recommended)' },
        { value: 'queue', label: 'Queue (max 10)' },
        { value: 'parallel', label: 'Run in parallel' },
      ],
      defaultValue: 'skip',
      description: '장기 실행 워크플로우가 cron 주기보다 오래 걸릴 때의 동작. 서버 스케줄러가 이 값을 읽어 처리.',
    },
  ],
};

export const TRIGGER_WEBHOOK: NodeDefinition = {
  type: 'TRIGGER_WEBHOOK',
  category: 'TRIGGER',
  label: 'Webhook Trigger',
  description: 'Start workflow via HTTP webhook (POST)',
  iconName: 'Webhook',
  color: 'green',
  inputs: [],
  outputs: [
    { name: 'trigger', type: 'trigger', label: 'Trigger' },
    { name: 'payload', type: 'json', label: 'Payload' },
    { name: 'headers', type: 'json', label: 'Headers' },
  ],
  configFields: [],
};

export const TRIGGER_EVENT: NodeDefinition = {
  type: 'TRIGGER_EVENT',
  category: 'TRIGGER',
  label: 'Event Trigger',
  description: 'Start workflow on system events',
  iconName: 'Bell',
  color: 'green',
  inputs: [],
  outputs: [
    { name: 'trigger', type: 'trigger', label: 'Trigger' },
    { name: 'event', type: 'json', label: 'Event Data' },
  ],
  configFields: [
    {
      name: 'eventType',
      label: 'Event Type',
      type: 'select',
      options: [
        { value: 'file_uploaded', label: 'File Uploaded' },
        { value: 'workflow_completed', label: 'Workflow Completed' },
        { value: 'custom', label: 'Custom Event' },
      ],
    },
    {
      name: 'eventName',
      label: 'Custom Event Name',
      type: 'text',
      dependsOn: { field: 'eventType', value: 'custom' },
    },
  ],
};

/**
 * Desktop-only: watches a directory for new files and triggers when changes happen.
 * Not used by iris/ (web app has no local fs access).
 */
export const TRIGGER_DIRECTORY: NodeDefinition = {
  type: 'TRIGGER_DIRECTORY',
  category: 'TRIGGER',
  label: 'Directory Watch',
  description: 'Trigger workflow when files are added to a directory',
  iconName: 'Folder',
  color: 'green',
  inputs: [],
  outputs: [
    { name: 'trigger', type: 'trigger', label: 'Trigger' },
    { name: 'file', type: 'any', label: 'File' },
    { name: 'path', type: 'text', label: 'File Path' },
  ],
  configFields: [
    {
      name: 'directoryPath',
      label: 'Directory Path',
      type: 'text',
      required: true,
      placeholder: '/path/to/watch',
    },
    {
      name: 'pattern',
      label: 'File Pattern',
      type: 'text',
      placeholder: '*.png',
      description: 'Glob pattern (optional)',
    },
  ],
};

// ─── Phase 3: 진입점 다양화 ─────────────────────────────────────────────────
// 각 트리거는 워크플로우를 시작시키는 새로운 외부 신호. 설계 사유는
// docs/plan/IRIS_NODES_EXPANSION_PLAN.md §6.1 참조.

/**
 * 채팅 UI 기반 트리거. 사용자가 메시지를 입력하면 워크플로우 발화.
 * AI 챗봇 워크플로우 표준 진입점이며, GEN_TEXT_TO_TEXT agent mode와
 * 결합하면 사내 어시스턴트를 분 단위로 구축 가능.
 */
export const TRIGGER_CHAT: NodeDefinition = {
  type: 'TRIGGER_CHAT',
  category: 'TRIGGER',
  label: 'Chat Trigger',
  description: 'Start workflow from a chat UI message (multi-turn 지원)',
  iconName: 'MessageCircle',
  color: 'green',
  inputs: [],
  outputs: [
    { name: 'trigger', type: 'trigger', label: 'Trigger' },
    { name: 'message', type: 'text', label: 'User Message' },
    { name: 'history', type: 'json', label: 'Conversation History' },
    { name: 'sessionId', type: 'text', label: 'Session ID', hideHandle: true },
  ],
  configFields: [
    {
      name: 'botName',
      label: 'Bot Name',
      type: 'text',
      defaultValue: 'Assistant',
      description: '채팅 UI 헤더에 표시되는 이름.',
    },
    {
      name: 'welcomeMessage',
      label: 'Welcome Message',
      type: 'textarea',
      placeholder: 'Hi! How can I help you today?',
      description: '첫 진입 시 사용자에게 보여줄 환영 문구.',
    },
    {
      name: 'enableHistory',
      label: 'Persist History',
      type: 'toggle',
      defaultValue: true,
      description: '같은 sessionId의 메시지 기록을 history 포트로 누적.',
    },
    {
      name: 'maxHistoryTurns',
      label: 'Max History Turns',
      type: 'number',
      min: 1,
      max: 100,
      defaultValue: 20,
      dependsOn: { field: 'enableHistory', value: true },
      description: 'context 폭주 방지 상한.',
    },
  ],
};

/**
 * 동적 폼 입력 트리거. 사용자 정의 필드를 폼으로 노출하고 제출 시
 * 워크플로우 발화. 비기술 사용자가 안전한 입력 검증과 함께 워크플로우를
 * 실행하게 해주는 표준 패턴.
 */
export const TRIGGER_FORM: NodeDefinition = {
  type: 'TRIGGER_FORM',
  category: 'TRIGGER',
  label: 'Form Trigger',
  description: 'Start workflow from a custom form submission',
  iconName: 'ClipboardList',
  color: 'green',
  inputs: [],
  outputs: [
    { name: 'trigger', type: 'trigger', label: 'Trigger' },
    { name: 'fields', type: 'json', label: 'Submitted Fields (object)' },
    { name: 'submittedBy', type: 'text', label: 'User ID', hideHandle: true },
  ],
  configFields: [
    {
      name: 'title',
      label: 'Form Title',
      type: 'text',
      required: true,
      placeholder: 'Submit Bug Report',
    },
    {
      name: 'description',
      label: 'Form Description',
      type: 'textarea',
      placeholder: 'Please provide as much detail as possible.',
    },
    {
      name: 'fields',
      label: 'Form Fields',
      type: 'textarea',
      required: true,
      placeholder: '[{ "name": "email", "type": "text", "required": true }, { "name": "severity", "type": "select", "options": ["low","high"] }]',
      description: 'JSON 배열. type: text|textarea|number|select|toggle|file. 향후 전용 row-add UI로 교체 예정.',
    },
    {
      name: 'submitButtonText',
      label: 'Submit Button Text',
      type: 'text',
      defaultValue: 'Submit',
    },
    {
      name: 'requireAuth',
      label: 'Require Login',
      type: 'toggle',
      defaultValue: true,
      description: 'true면 로그인한 사용자만 폼 접근 가능 (submittedBy 채워짐).',
    },
  ],
};

/**
 * 이메일 수신 트리거. Gmail Push API (Pub/Sub) 또는 IMAP polling 백엔드로
 * 새 메일 수신 시 워크플로우 발화. 인박스 자동화 (티켓 분류, 알림, 응답
 * 초안 생성) 표준 진입점.
 */
export const TRIGGER_EMAIL_RECEIVED: NodeDefinition = {
  type: 'TRIGGER_EMAIL_RECEIVED',
  category: 'TRIGGER',
  label: 'Email Received',
  description: 'Start workflow when a new email arrives (Gmail Push or IMAP polling)',
  iconName: 'Inbox',
  color: 'green',
  inputs: [],
  outputs: [
    { name: 'trigger', type: 'trigger', label: 'Trigger' },
    { name: 'from', type: 'text', label: 'From' },
    { name: 'subject', type: 'text', label: 'Subject' },
    { name: 'body', type: 'text', label: 'Body (plain text)' },
    { name: 'bodyHtml', type: 'text', label: 'Body (HTML)', hideHandle: true },
    { name: 'attachments', type: 'json', label: 'Attachments' },
    { name: 'messageId', type: 'text', label: 'Message ID', hideHandle: true },
  ],
  configFields: [
    {
      name: 'provider',
      label: 'Provider',
      type: 'select',
      options: [
        { value: 'gmail', label: 'Gmail (Pub/Sub Push)' },
        { value: 'imap', label: 'IMAP (polling)' },
      ],
      defaultValue: 'gmail',
      description: 'Gmail은 OAuth (즉시 수신). IMAP은 polling (분 단위 지연).',
    },
    {
      name: 'mailbox',
      label: 'Mailbox / Label',
      type: 'text',
      defaultValue: 'INBOX',
      description: '감시할 라벨/폴더.',
    },
    {
      name: 'subjectFilter',
      label: 'Subject Filter (regex)',
      type: 'text',
      placeholder: '\\[bug\\]|\\[support\\]',
      description: '비어두면 모든 메일. 정규식 매칭되는 subject만 통과.',
    },
    {
      name: 'fromFilter',
      label: 'From Filter (substring)',
      type: 'text',
      placeholder: '@customer-domain.com',
      description: '비어두면 모든 발신자. 부분 매칭.',
    },
    {
      name: 'markAsRead',
      label: 'Mark as Read after Processing',
      type: 'toggle',
      defaultValue: false,
      description: 'true면 워크플로우 완료 시 메일을 읽음 처리.',
    },
  ],
};
