/**
 * ExtensionPanel — sandbox regression tests.
 *
 * The panel renders untrusted, extension-authored HTML. These tests lock in the
 * isolation properties that keep a `ui:panel`-only extension (auto-approved for
 * the community trust tier) from reaching `parent.electronAPI.*`:
 *
 *   - the document is delivered via `srcdoc`, never written into a same-origin
 *     about:blank document,
 *   - the sandbox never carries `allow-same-origin` (which, combined with
 *     `allow-scripts`, voids the sandbox entirely),
 *   - no escape-hatch tokens (top navigation, popups, modals, forms),
 *   - an inline CSP blocks remote subresources and network calls.
 */
import '@/shared/lib/i18n';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ExtensionPanel } from '../components/ExtensionPanel';

function renderPanel(html: string) {
  render(
    <ExtensionPanel
      panelId="pub.ext.panel.1"
      extensionId="pub.ext"
      title="Test Panel"
      html={html}
      onClose={() => {}}
    />
  );
  return screen.getByTitle('Extension Panel: Test Panel') as HTMLIFrameElement;
}

describe('ExtensionPanel sandboxing', () => {
  it('never grants allow-same-origin (would void the sandbox with allow-scripts)', () => {
    const iframe = renderPanel('<p>hello</p>');
    const sandbox = iframe.getAttribute('sandbox') ?? '';
    expect(sandbox).not.toContain('allow-same-origin');
  });

  it('grants only allow-scripts — no top-navigation/popup/modal/form escapes', () => {
    const iframe = renderPanel('<p>hello</p>');
    const tokens = (iframe.getAttribute('sandbox') ?? '').split(/\s+/).filter(Boolean);
    expect(tokens).toEqual(['allow-scripts']);
  });

  it('delegates clipboard-write via Permissions Policy, not via the sandbox', () => {
    // Without allow="clipboard-write" the frame's policy evaluates to false and
    // every panel "copy" button fails with NotAllowedError. Delegating the one
    // feature keeps the origin opaque — unlike allow-same-origin, which would
    // reopen the escape hatch.
    const iframe = renderPanel('<p>hello</p>');
    expect(iframe.getAttribute('allow')).toBe('clipboard-write');
    expect(iframe.getAttribute('sandbox') ?? '').not.toContain('allow-same-origin');
  });

  it('delivers content via srcdoc rather than a same-origin document write', () => {
    const iframe = renderPanel('<p data-testid="marker">hello</p>');
    const srcdoc = iframe.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('data-testid="marker"');
    // No src navigation — the document comes from srcdoc only.
    expect(iframe.getAttribute('src')).toBeNull();
  });

  it('embeds a CSP that blocks remote subresources and network calls', () => {
    const iframe = renderPanel('<p>hello</p>');
    const srcdoc = iframe.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('http-equiv="Content-Security-Policy"');
    expect(srcdoc).toContain("default-src 'none'");
    expect(srcdoc).toContain("connect-src 'none'");
    expect(srcdoc).toContain("form-action 'none'");
    // Images are allowed only from inline sources, so a panel cannot
    // exfiltrate data through an image URL without the `network` permission.
    expect(srcdoc).toContain('img-src data: blob:');
    expect(srcdoc).not.toContain('img-src https:');
  });

  it('renders a real example panel payload (inline handlers + postMessage)', () => {
    // Shape taken from extensions/examples/color-palette + ai-captioner:
    // inline onclick handlers and window.parent.postMessage, which stay valid
    // under an opaque-origin sandbox (postMessage is cross-origin by design).
    const examplePanel = `
      <div style="padding:12px">
        <h3>Color Palette</h3>
        <div onclick="navigator.clipboard.writeText('#ff0000');this.textContent='Copied!'">#ff0000</div>
        <button onclick="window.parent.postMessage({type:'copied'},'*')">Copy all</button>
      </div>
    `;
    const iframe = renderPanel(examplePanel);
    const srcdoc = iframe.getAttribute('srcdoc') ?? '';
    expect(srcdoc).toContain('Color Palette');
    expect(srcdoc).toContain('window.parent.postMessage');
    // Scripts still run inside the frame — inline handlers are preserved.
    expect(iframe.getAttribute('sandbox')).toContain('allow-scripts');
  });

  it('shows the extension id and title in the panel header', () => {
    renderPanel('<p>hello</p>');
    expect(screen.getByText('pub.ext')).toBeTruthy();
    expect(screen.getByText('Test Panel')).toBeTruthy();
  });
});
