import type { NodeDefinition } from '../types.js';

export const OUTPUT_STORAGE: NodeDefinition = {
  type: 'OUTPUT_STORAGE',
  category: 'OUTPUT',
  label: 'Save to Storage',
  description: 'Save output to cloud storage',
  iconName: 'HardDrive',
  color: 'teal',
  inputs: [
    { name: 'data', type: 'any', label: 'Data', required: true },
  ],
  outputs: [
    { name: 'url', type: 'text', label: 'Storage URL' },
  ],
  configFields: [
    {
      name: 'folder',
      label: 'Folder',
      type: 'text',
      placeholder: 'workflow-outputs',
    },
    {
      name: 'filename',
      label: 'Filename Pattern',
      type: 'text',
      placeholder: '{{timestamp}}_output',
      description: 'Use {{timestamp}}, {{uuid}}, {{date}}',
    },
  ],
};

export const OUTPUT_WEBHOOK: NodeDefinition = {
  type: 'OUTPUT_WEBHOOK',
  category: 'OUTPUT',
  label: 'Webhook Output',
  description: 'Send results to webhook',
  iconName: 'Webhook',
  color: 'teal',
  inputs: [
    { name: 'data', type: 'any', label: 'Data', required: true },
  ],
  outputs: [
    { name: 'response', type: 'json', label: 'Response' },
  ],
  configFields: [
    {
      name: 'url',
      label: 'Webhook URL',
      type: 'text',
      required: true,
    },
    {
      name: 'method',
      label: 'Method',
      type: 'select',
      options: [
        { value: 'POST', label: 'POST' },
        { value: 'PUT', label: 'PUT' },
      ],
      defaultValue: 'POST',
    },
  ],
};

export const OUTPUT_EMAIL: NodeDefinition = {
  type: 'OUTPUT_EMAIL',
  category: 'OUTPUT',
  label: 'Send Email',
  description: 'Send results via email',
  iconName: 'Mail',
  color: 'teal',
  inputs: [
    { name: 'content', type: 'text', label: 'Content', required: true },
    { name: 'attachments', type: 'any', label: 'Attachments' },
  ],
  outputs: [
    { name: 'sent', type: 'any', label: 'Sent' },
  ],
  configFields: [
    {
      name: 'to',
      label: 'To',
      type: 'text',
      required: true,
      placeholder: 'email@example.com',
    },
    {
      name: 'subject',
      label: 'Subject',
      type: 'text',
      required: true,
    },
  ],
};

export const OUTPUT_NOTIFICATION: NodeDefinition = {
  type: 'OUTPUT_NOTIFICATION',
  category: 'OUTPUT',
  label: 'Notification',
  description: 'Send push notification',
  iconName: 'BellRing',
  color: 'teal',
  inputs: [
    { name: 'message', type: 'text', label: 'Message', required: true },
  ],
  outputs: [
    { name: 'sent', type: 'any', label: 'Sent' },
  ],
  configFields: [
    {
      name: 'title',
      label: 'Title',
      type: 'text',
      required: true,
    },
    {
      name: 'channel',
      label: 'Channel',
      type: 'select',
      options: [
        { value: 'push', label: 'Push Notification' },
        { value: 'slack', label: 'Slack' },
        { value: 'discord', label: 'Discord' },
      ],
      defaultValue: 'push',
    },
  ],
};

// ─── Phase 3: 통합 출력 확장 ────────────────────────────────────────────────
// 기존 OUTPUT_NOTIFICATION이 slack/discord를 묶었던 것을 분리해서, 각
// 서비스 고유 기능 (Slack Block Kit, Sheets row schema 등)을 first-class로
// 노출. 설계 사유는 §6.3 참조.

/**
 * Slack 메시지/스레드 포스팅. 단순 텍스트부터 Block Kit (버튼/필드/이미지)
 * 까지 지원. 기존 OUTPUT_NOTIFICATION의 slack 옵션은 단순 message만 지원,
 * 이 노드는 풍부한 UI 메시지 발행 가능.
 */
export const OUTPUT_SLACK_POST: NodeDefinition = {
  type: 'OUTPUT_SLACK_POST',
  category: 'OUTPUT',
  label: 'Slack Post',
  description: 'Slack 채널/DM에 메시지 발행 (Block Kit 지원)',
  iconName: 'MessageSquareText',
  color: 'teal',
  inputs: [
    { name: 'text', type: 'text', label: 'Message', required: true },
    { name: 'blocks', type: 'json', label: 'Block Kit (override)' },
    { name: 'attachments', type: 'any', label: 'Attachments (files/images)' },
  ],
  outputs: [
    { name: 'messageTs', type: 'text', label: 'Message Timestamp' },
    { name: 'channelId', type: 'text', label: 'Channel ID', hideHandle: true },
    { name: 'permalink', type: 'text', label: 'Permalink' },
  ],
  configFields: [
    {
      name: 'channel',
      label: 'Channel / User',
      type: 'text',
      required: true,
      placeholder: '#general or @username or C01234567',
      description: '채널 이름(#prefix), 사용자(@prefix), 또는 ID.',
    },
    {
      name: 'username',
      label: 'Bot Display Name',
      type: 'text',
      placeholder: 'Workflow Bot',
      description: '메시지에 표시될 발신자 이름.',
    },
    {
      name: 'iconEmoji',
      label: 'Icon Emoji',
      type: 'text',
      placeholder: ':robot_face:',
    },
    {
      name: 'threadTs',
      label: 'Reply to Thread (timestamp)',
      type: 'text',
      placeholder: '1700000000.123456',
      description: '비워두면 새 메시지. 값이 있으면 해당 메시지 스레드에 답글.',
    },
    {
      name: 'blocksTemplate',
      label: 'Block Kit Template (JSON)',
      type: 'textarea',
      placeholder: '[{ "type": "section", "text": {"type": "mrkdwn", "text": "*Hello*"} }]',
      description: '입력 blocks 포트가 있으면 그쪽이 우선. 정적 템플릿용.',
    },
  ],
};

/**
 * Google Sheets 시트에 row 추가. 워크플로우 결과를 CRM/리포트/로그
 * 시트에 자동 기록. row를 JSON object로 받아 컬럼 매핑.
 */
export const OUTPUT_SHEET_APPEND: NodeDefinition = {
  type: 'OUTPUT_SHEET_APPEND',
  category: 'OUTPUT',
  label: 'Sheet Append',
  description: 'Google Sheets에 row 추가',
  iconName: 'Sheet',
  color: 'teal',
  inputs: [
    { name: 'row', type: 'json', label: 'Row (object)', required: true },
  ],
  outputs: [
    { name: 'rowNumber', type: 'any', label: 'Inserted Row Number' },
    { name: 'updatedRange', type: 'text', label: 'Updated Range', hideHandle: true },
  ],
  configFields: [
    {
      name: 'sheetId',
      label: 'Spreadsheet ID',
      type: 'text',
      required: true,
      placeholder: '1abc...XYZ',
      description: 'Sheets URL의 /d/{ID}/ 부분.',
    },
    {
      name: 'sheetName',
      label: 'Sheet (Tab) Name',
      type: 'text',
      defaultValue: 'Sheet1',
    },
    {
      name: 'range',
      label: 'Range',
      type: 'text',
      defaultValue: 'A:Z',
      description: '추가될 범위 (A1 표기). 시트 끝에 append.',
    },
    {
      name: 'columnMapping',
      label: 'Column Mapping',
      type: 'textarea',
      placeholder: '{ "name": "A", "email": "B", "score": "C" }',
      description: 'row object의 각 key를 어느 컬럼에 매핑할지. 비어두면 row 객체 순서대로.',
    },
    {
      name: 'createHeaderIfMissing',
      label: 'Create Header Row if Missing',
      type: 'toggle',
      defaultValue: true,
      description: '시트가 비어있으면 첫 row를 header로 작성.',
    },
    {
      name: 'valueInputOption',
      label: 'Value Input Option',
      type: 'select',
      options: [
        { value: 'USER_ENTERED', label: 'USER_ENTERED (수식 파싱)' },
        { value: 'RAW', label: 'RAW (그대로 저장)' },
      ],
      defaultValue: 'USER_ENTERED',
    },
  ],
};
