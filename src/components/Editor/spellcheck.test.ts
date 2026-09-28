import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Compartment, EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import type { SpellError } from '@/lib/tauri';

const spellCheckMock = vi.fn<(texts: string[], languages: string[]) => Promise<SpellError[][]>>();

vi.mock('@/lib/tauri', () => ({
  spellCheck: (texts: string[], languages: string[]) => spellCheckMock(texts, languages),
}));

import { misspellingAt, spellcheckExtension } from './spellcheck';
import { useViewStore } from '@/store/view';

/** A promise plus its resolver, so a test can control exactly when a mocked `spellCheck` call
 * settles relative to other events (a reconfigure, a later call, ...). */
function deferred<T>(): { promise: Promise<T>; resolve: (v: T) => void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function misspelled(
  kind: SpellError['kind'] = 'misspelled',
): (start: number, length: number) => SpellError {
  return (start, length) => ({ start, length, kind });
}

describe('SpellCheckPlugin - stale replies after a reconfigure (review fix 1)', () => {
  let host: HTMLElement;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    spellCheckMock.mockReset();
    useViewStore.setState({ spellIgnored: new Set() });
  });

  afterEach(() => {
    host.remove();
  });

  it('does not apply an old plugin instance’s reply after it has been destroyed by a reconfigure', async () => {
    const first = deferred<SpellError[][]>();
    spellCheckMock.mockReturnValueOnce(first.promise);

    const compartment = new Compartment();
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: 'helllo world',
        // Away from "helllo" (0..6): the default cursor at 0 would otherwise touch it and hide
        // its squiggle regardless of which reply applied - not what this test is about.
        selection: { anchor: 11 },
        extensions: [
          markdown({ base: markdownLanguage }),
          compartment.of(spellcheckExtension(['en-US'], [])),
        ],
      }),
    });

    // Let the initial, constructor-scheduled check fire and reach the (mocked, still-pending) IPC call.
    await vi.waitFor(() => expect(spellCheckMock).toHaveBeenCalledTimes(1));

    // Reconfigure - as a language/dictionary change or a tab switch would - which destroys the
    // first plugin instance while its request is still in flight, and starts a second one.
    const second = deferred<SpellError[][]>();
    spellCheckMock.mockReturnValueOnce(second.promise);
    view.dispatch({ effects: compartment.reconfigure(spellcheckExtension(['ar-SA'], [])) });

    // The destroyed instance's request now resolves, flagging "helllo" - this must never reach
    // the view, since it belongs to the languages/instance that's no longer live.
    first.resolve([[misspelled()(0, 6)]]);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(misspellingAt(view.state, 2)).toBeNull();

    // The second (current) instance's own reply still applies normally.
    await vi.waitFor(() => expect(spellCheckMock).toHaveBeenCalledTimes(2));
    second.resolve([[misspelled()(0, 6)]]);
    await vi.waitFor(() => expect(misspellingAt(view.state, 2)).not.toBeNull());
    expect(misspellingAt(view.state, 2)?.word).toBe('helllo');

    view.destroy();
  });

  it('does not dispatch into a view destroyed outright (not just reconfigured)', async () => {
    const first = deferred<SpellError[][]>();
    spellCheckMock.mockReturnValueOnce(first.promise);

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: 'helllo world',
        extensions: [markdown({ base: markdownLanguage }), spellcheckExtension(['en-US'], [])],
      }),
    });

    await vi.waitFor(() => expect(spellCheckMock).toHaveBeenCalledTimes(1));
    view.destroy();

    // Resolving after the view is gone must not throw (e.g. from dispatching into a destroyed view).
    first.resolve([[misspelled()(0, 6)]]);
    await expect(Promise.resolve().then(() => Promise.resolve())).resolves.toBeUndefined();
  });
});
