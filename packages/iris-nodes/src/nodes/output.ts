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

/**
 * 워크플로우 결과를 이메일로 발송. 발신 주소는 플랫폼 도메인 고정
 * (호스트의 SMTP 설정 — 사용자가 임의 발신자를 사칭할 수 없다).
 * 실제 발송은 host.handlers.sendEmail seam — SMTP 자격이 서버에 있어
 * 엔진이 직접 보내지 않는다. 미지원 호스트는 NODE_NOT_SUPPORTED 501.
 *
 * attachments는 data URL 문자열, { file, filename } (UTIL_FILE_CONVERT
 * 출력 그대로), 또는 그 배열을 받는다 (합계 10MB 상한).
 */
export const OUTPUT_EMAIL: NodeDefinition = {
  type: 'OUTPUT_EMAIL',
  category: 'OUTPUT',
  label: 'Send Email',
  description: 'Send results via email (플랫폼 발신 주소 고정)',
  iconName: 'Mail',
  color: 'teal',
  inputs: [
    { name: 'content', type: 'text', label: 'Content', required: true },
    { name: 'subject', type: 'text', label: 'Subject (override)' },
    { name: 'to', type: 'text', label: 'To (override)' },
    { name: 'attachments', type: 'any', label: 'Attachments' },
  ],
  outputs: [
    { name: 'sent', type: 'any', label: 'Sent' },
    { name: 'recipients', type: 'any', label: 'Recipient Count', hideHandle: true },
  ],
  configFields: [
    {
      name: 'to',
      label: 'To',
      type: 'text',
      required: true,
      placeholder: 'a@example.com, b@example.com',
      description: '쉼표 구분, 최대 5명. `to` input이 연결되면 그것이 우선.',
    },
    {
      name: 'subject',
      label: 'Subject',
      type: 'text',
      required: true,
    },
    {
      name: 'contentType',
      label: 'Content Type',
      type: 'select',
      options: [
        { value: 'text', label: 'Plain Text' },
        { value: 'html', label: 'HTML' },
      ],
      defaultValue: 'text',
    },
  ],
};

/**
 * Discord Incoming Webhook 발송 — OAuth·봇 토큰 불필요, 사용자가 자기
 * 서버의 웹훅 URL만 붙여넣으면 된다 (자격증명 볼트 이전의 발신 채널).
 * discord.com/api/webhooks/ URL만 허용 — 임의 URL은 OUTPUT_WEBHOOK을 쓴다.
 */
export const OUTPUT_DISCORD: NodeDefinition = {
  type: 'OUTPUT_DISCORD',
  category: 'OUTPUT',
  label: 'Discord Post',
  description: 'Discord 채널에 메시지 발행 (Incoming Webhook URL)',
  iconName: 'MessagesSquare',
  color: 'teal',
  inputs: [
    { name: 'message', type: 'text', label: 'Message', required: true },
    { name: 'embeds', type: 'json', label: 'Embeds (override)' },
  ],
  outputs: [
    { name: 'sent', type: 'any', label: 'Sent' },
    { name: 'messageId', type: 'text', label: 'Message ID', hideHandle: true },
  ],
  configFields: [
    {
      name: 'webhookUrl',
      label: 'Webhook URL',
      type: 'text',
      required: true,
      placeholder: 'https://discord.com/api/webhooks/...',
      description: 'Discord 채널 설정 → 연동 → 웹후크에서 발급.',
    },
    {
      name: 'username',
      label: 'Display Name',
      type: 'text',
      placeholder: 'Workflow Bot',
      description: '웹훅 기본 이름 대신 표시할 발신자 이름.',
    },
    {
      name: 'avatarUrl',
      label: 'Avatar URL',
      type: 'text',
      placeholder: 'https://...png',
    },
    {
      name: 'embedsTemplate',
      label: 'Embeds (JSON)',
      type: 'textarea',
      placeholder: '[{ "title": "Report", "description": "...", "color": 5814783 }]',
      description: 'Discord embed 객체 JSON 배열. `embeds` input이 연결되면 그것이 우선.',
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
      placeholder: '#general, @username, C01234567, or https://hooks.slack.com/...',
      description: '채널 이름(#prefix), 사용자(@prefix), ID — 또는 Slack Incoming Webhook URL을 넣으면 봇 토큰 없이 자신의 워크스페이스로 발송.',
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
