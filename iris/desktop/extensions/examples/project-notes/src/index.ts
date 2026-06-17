/**
 * Project Notes
 * Attach markdown notes to each image file for tracking edit intentions and revision history.
 */

interface ImageNote {
  fileName: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export function activate(context: IrisExtensionContext) {
  const NOTES_KEY = 'imageNotes';

  async function getAllNotes(): Promise<Record<string, ImageNote>> {
    return ((await iris.storage.get(NOTES_KEY)) as Record<string, ImageNote>) || {};
  }

  async function saveNote(fileName: string, content: string) {
    const notes = await getAllNotes();
    const now = new Date().toISOString();

    if (notes[fileName]) {
      notes[fileName].content = content;
      notes[fileName].updatedAt = now;
    } else {
      notes[fileName] = {
        fileName,
        content,
        createdAt: now,
        updatedAt: now,
      };
    }

    await iris.storage.set(NOTES_KEY, notes);
  }

  context.subscriptions.push(
    iris.commands.register('iris-official.project-notes.open', async () => {
      const fileInfo = await iris.image.getActiveFileInfo();
      if (!fileInfo) {
        await iris.window.showMessage('No active image file.', 'warn');
        return;
      }

      const notes = await getAllNotes();
      const existing = notes[fileInfo.fileName];
      const currentContent = existing?.content || '';

      const html = `
        <div style="padding:16px;font-family:system-ui;height:100%;display:flex;flex-direction:column">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <h2 style="margin:0">Notes: ${fileInfo.fileName}</h2>
            <span style="font-size:12px;color:#9ca3af">${fileInfo.format} · ${fileInfo.width}×${fileInfo.height}</span>
          </div>

          ${existing ? `<div style="font-size:11px;color:#9ca3af;margin-bottom:8px">Last updated: ${new Date(existing.updatedAt).toLocaleString()}</div>` : ''}

          <textarea id="noteContent"
            placeholder="Write your notes here... (supports markdown)"
            style="flex:1;min-height:200px;padding:12px;border:1px solid #d1d5db;border-radius:8px;font-family:monospace;font-size:13px;line-height:1.6;resize:vertical"
          >${currentContent}</textarea>

          <div style="display:flex;gap:8px;margin-top:12px">
            <button onclick="
              const content = document.getElementById('noteContent').value;
              window.parent.postMessage({ type: 'saveNote', fileName: '${fileInfo.fileName}', content }, '*');
            " style="padding:8px 20px;border:none;background:#0a0a0a;color:white;border-radius:20px;cursor:pointer">
              Save Note
            </button>
            <button onclick="
              document.getElementById('noteContent').value = '';
              window.parent.postMessage({ type: 'deleteNote', fileName: '${fileInfo.fileName}' }, '*');
            " style="padding:8px 20px;border:1px solid #d1d5db;background:white;border-radius:20px;cursor:pointer">
              Clear
            </button>
          </div>
        </div>
      `;

      await iris.window.createPanel(html, {
        title: `Notes: ${fileInfo.fileName}`,
        location: 'sidebar',
      });
    })
  );

  context.subscriptions.push(
    iris.commands.register('iris-official.project-notes.search', async () => {
      const query = await iris.window.showInputBox({
        prompt: 'Search notes',
        placeholder: 'Enter search term...',
      });

      if (!query) return;

      const notes = await getAllNotes();
      const lowerQuery = query.toLowerCase();

      const matches = Object.values(notes).filter(
        (note) =>
          note.fileName.toLowerCase().includes(lowerQuery) ||
          note.content.toLowerCase().includes(lowerQuery)
      );

      if (matches.length === 0) {
        await iris.window.showMessage(`No notes found for "${query}".`, 'info');
        return;
      }

      const results = matches
        .map(
          (note) => `
          <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <strong style="font-size:14px">${note.fileName}</strong>
              <span style="font-size:11px;color:#9ca3af">${new Date(note.updatedAt).toLocaleDateString()}</span>
            </div>
            <p style="margin:0;font-size:13px;color:#374151;white-space:pre-wrap;max-height:80px;overflow:hidden">${note.content.substring(0, 200)}${note.content.length > 200 ? '...' : ''}</p>
          </div>
        `
        )
        .join('');

      const html = `
        <div style="padding:16px;font-family:system-ui">
          <h2 style="margin:0 0 4px">Search Results</h2>
          <p style="color:#6b7280;font-size:14px;margin:0 0 16px">
            ${matches.length} note(s) matching "${query}"
          </p>
          ${results}
        </div>
      `;

      await iris.window.createPanel(html, { title: 'Note Search', location: 'floating' });
    })
  );

  iris.log.info('Project Notes activated');
}

export function deactivate() {}
