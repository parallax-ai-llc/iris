/**
 * Command history (07-shell-and-common.md C2/C3, 04-workflow-editor.md 3.4).
 *
 * Every saved-state change is a `Command` with `do`/`undo`. `begin`/`commit`
 * group several commands into one undo step (AI apply, paste, multi delete);
 * `mergeKey` folds consecutive edits of one field typed within a second into
 * one step. Dirty is "head entry id ≠ saved entry id": undoing back to the
 * saved point is clean again, and ids (not positions) survive trimming.
 *
 * The history is generic over the document type and has no React or store
 * dependency; the editor store owns one instance per open document.
 */

export interface Command<D> {
  /** Menu label ("Undo: <label>"), an i18n key or plain text. */
  label: string;
  /** First apply and redo. */
  do(doc: D): D;
  undo(doc: D): D;
  /** Rough memory held by the command (bytes). */
  bytes: number;
  /** Consecutive commands with the same key within `mergeWindowMs` merge. */
  mergeKey?: string;
}

export interface HistoryEntryInfo {
  id: string;
  label: string;
  bytes: number;
}

export interface History {
  execute(cmd: Command<unknown>): void;
  begin(label: string): void;
  commit(): void;
  rollback(): void;
  undo(): void;
  redo(): void;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly inTransaction: boolean;
  breakMerge(): void;
  markSaved(entryId: string): void;
  readonly isDirty: boolean;
  readonly headEntryId: string;
  readonly savedEntryId: string | null;
  list(): HistoryEntryInfo[];
  jumpTo(entryId: string): void;
  subscribe(fn: () => void): () => void;
}

interface Entry<D> {
  id: string;
  label: string;
  commands: Command<D>[];
  bytes: number;
  mergeKey?: string;
  at: number;
}

export const ROOT_ENTRY_ID = 'root';

let entrySeq = 0;
const nextEntryId = () => `h${Date.now().toString(36)}-${(entrySeq++).toString(36)}`;

export interface DocHistoryOptions {
  /** Max undo steps kept (07 C2: workflow 200). */
  maxEntries?: number;
  /** Max bytes kept across entries. */
  maxBytes?: number;
  /** Merge window for `mergeKey` (07 C2: 1 s). */
  mergeWindowMs?: number;
  now?: () => number;
}

/**
 * History over a document held outside (the store). `getDoc`/`setDoc` read and
 * replace the current document; commands are applied through them.
 */
export class DocHistory<D> implements History {
  private done: Entry<D>[] = [];
  private undone: Entry<D>[] = [];
  private tx: { label: string; commands: Command<D>[]; depth: number; base: D } | null = null;
  private saved: string | null = ROOT_ENTRY_ID;
  private mergeBroken = false;
  private listeners = new Set<() => void>();
  private readonly maxEntries: number;
  private readonly maxBytes: number;
  private readonly mergeWindowMs: number;
  private readonly now: () => number;

  private readonly getDoc: () => D;
  private readonly setDoc: (doc: D) => void;

  constructor(getDoc: () => D, setDoc: (doc: D) => void, options: DocHistoryOptions = {}) {
    this.getDoc = getDoc;
    this.setDoc = setDoc;
    this.maxEntries = options.maxEntries ?? 200;
    this.maxBytes = options.maxBytes ?? 512 * 1024 * 1024;
    this.mergeWindowMs = options.mergeWindowMs ?? 1000;
    this.now = options.now ?? Date.now;
  }

  get headEntryId(): string {
    return this.done.length ? this.done[this.done.length - 1].id : ROOT_ENTRY_ID;
  }
  get savedEntryId(): string | null {
    return this.saved;
  }
  get isDirty(): boolean {
    return this.saved === null || this.saved !== this.headEntryId;
  }
  get canUndo(): boolean {
    return this.done.length > 0 || this.tx !== null;
  }
  get canRedo(): boolean {
    return this.undone.length > 0 && this.tx === null;
  }
  get inTransaction(): boolean {
    return this.tx !== null;
  }

  execute(cmd: Command<unknown>): void {
    const c = cmd as Command<D>;
    this.setDoc(c.do(this.getDoc()));
    if (this.tx) {
      this.tx.commands.push(c);
      this.emit();
      return;
    }
    this.undone = [];
    const last = this.done[this.done.length - 1];
    if (
      c.mergeKey &&
      last &&
      !this.mergeBroken &&
      last.mergeKey === c.mergeKey &&
      this.now() - last.at <= this.mergeWindowMs &&
      last.id !== this.saved
    ) {
      last.commands.push(c);
      last.bytes += c.bytes;
      last.at = this.now();
    } else {
      this.push({ id: nextEntryId(), label: c.label, commands: [c], bytes: c.bytes, mergeKey: c.mergeKey, at: this.now() });
    }
    this.mergeBroken = false;
    this.emit();
  }

  begin(label: string): void {
    if (this.tx) {
      this.tx.depth++;
      return;
    }
    this.tx = { label, commands: [], depth: 1, base: this.getDoc() };
  }

  commit(): void {
    if (!this.tx) return;
    if (--this.tx.depth > 0) return;
    const { label, commands } = this.tx;
    this.tx = null;
    if (commands.length > 0) {
      this.undone = [];
      this.push({
        id: nextEntryId(),
        label,
        commands,
        bytes: commands.reduce((n, c) => n + c.bytes, 0),
        at: this.now(),
      });
    }
    this.mergeBroken = true;
    this.emit();
  }

  rollback(): void {
    if (!this.tx) return;
    const { base } = this.tx;
    this.tx = null;
    this.setDoc(base);
    this.emit();
  }

  undo(): void {
    if (this.tx) this.commit();
    const entry = this.done.pop();
    if (!entry) return;
    let doc = this.getDoc();
    for (let i = entry.commands.length - 1; i >= 0; i--) doc = entry.commands[i].undo(doc);
    this.setDoc(doc);
    this.undone.push(entry);
    this.mergeBroken = true;
    this.emit();
  }

  redo(): void {
    if (this.tx) return;
    const entry = this.undone.pop();
    if (!entry) return;
    let doc = this.getDoc();
    for (const c of entry.commands) doc = c.do(doc);
    this.setDoc(doc);
    this.done.push(entry);
    this.mergeBroken = true;
    this.emit();
  }

  breakMerge(): void {
    this.mergeBroken = true;
  }

  markSaved(entryId: string): void {
    // A saved point that was trimmed away can never be reached again.
    const known =
      entryId === ROOT_ENTRY_ID ||
      this.done.some(e => e.id === entryId) ||
      this.undone.some(e => e.id === entryId);
    this.saved = known ? entryId : null;
    this.mergeBroken = true;
    this.emit();
  }

  list(): HistoryEntryInfo[] {
    return this.done.map(e => ({ id: e.id, label: e.label, bytes: e.bytes }));
  }

  jumpTo(entryId: string): void {
    if (entryId === this.headEntryId) return;
    if (entryId === ROOT_ENTRY_ID || this.done.some(e => e.id === entryId)) {
      while (this.headEntryId !== entryId && this.done.length) this.undo();
      return;
    }
    if (this.undone.some(e => e.id === entryId)) {
      while (this.headEntryId !== entryId && this.undone.length) this.redo();
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Forget every entry (a reloaded document starts with an empty history). */
  reset(saved: string | null = ROOT_ENTRY_ID): void {
    this.done = [];
    this.undone = [];
    this.tx = null;
    this.saved = saved;
    this.mergeBroken = false;
    this.emit();
  }

  private push(entry: Entry<D>): void {
    this.done.push(entry);
    let bytes = this.done.reduce((n, e) => n + e.bytes, 0);
    while (this.done.length > this.maxEntries || (bytes > this.maxBytes && this.done.length > 1)) {
      const dropped = this.done.shift()!;
      bytes -= dropped.bytes;
      // `root` now means "everything left undone", i.e. the state after the
      // dropped entry. The old root state is gone for good.
      if (this.saved === ROOT_ENTRY_ID) this.saved = null;
      else if (this.saved === dropped.id) this.saved = ROOT_ENTRY_ID;
    }
  }

  private emit(): void {
    for (const fn of this.listeners) fn();
  }
}
