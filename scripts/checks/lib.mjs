/**
 * Shared helpers for the running-app checks: a CDP connection to the dev app's page with real
 * mouse and key events, PASS/FAIL reporting and small screenshots.
 *
 * The app must be running with remote debugging (see `launch.ps1`). Checks change settings with
 * `{ persist: false }` only and put the editor text back when they're done, so the document is
 * never left dirty.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.CDP_PORT ?? '9222';

/** Repository root, for fixture paths. */
export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Absolute path of a file in `fixtures/`. */
export const fixture = (name) => resolve(ROOT, 'fixtures', name);

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Reads `--name value` and `--flag` arguments. */
export function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    out[argv[i].slice(2)] = next && !next.startsWith('--') ? argv[++i] : true;
  }
  return out;
}

/** Connects to the dev app's main page and returns the check helpers. */
export async function connect() {
  let list;
  try {
    list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  } catch {
    throw new Error(
      `Nothing is listening on port ${PORT}. Start the app with scripts/checks/launch.ps1.`,
    );
  }
  const page = list.find(
    (t) =>
      t.type === 'page' && t.url.startsWith('http://localhost:1420') && !t.url.includes('#guide'),
  );
  if (!page) throw new Error('App page not found. Targets: ' + list.map((t) => t.url).join(', '));

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = rej;
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });

  /** Runs an async function body in the page and returns its `return` value. */
  const js = async (body) => {
    const r = await send('Runtime.evaluate', {
      expression: `(async () => { ${body} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    }
    return r.result.value;
  };

  // The dev stores are exposed a moment after the first paint.
  for (let i = 0; i < 40 && !(await js('return !!window.__mdv;')); i++) await wait(250);
  if (!(await js('return !!window.__mdv;')))
    throw new Error('window.__mdv never appeared: is this a dev build?');

  const mouse = async (x, y, button = 'left') => {
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      const moving = type === 'mouseMoved';
      await send('Input.dispatchMouseEvent', {
        type,
        x,
        y,
        button: moving ? 'none' : button,
        clickCount: moving ? 0 : 1,
      });
    }
    await wait(250);
  };

  const hover = async (x, y) => {
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none' });
    await wait(500);
  };

  /** Centre of the first element matching `selector` (and containing `text`), or null. */
  const center = (selector, text) =>
    js(`const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
      const e = ${text ? `els.find((e) => e.textContent.trim().startsWith(${JSON.stringify(text)}))` : 'els[0]'};
      if (!e) return null; const r = e.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };`);

  /** Clicks the element's centre with a real mouse event. Returns false if it isn't there. */
  const click = async (selector, text, button = 'left') => {
    const c = await center(selector, text);
    if (!c) return false;
    await mouse(c.x, c.y, button);
    return true;
  };

  const KEYS = {
    Escape: 27,
    Enter: 13,
    Tab: 9,
    ArrowDown: 40,
    ArrowUp: 38,
    ArrowRight: 39,
    ArrowLeft: 37,
    ContextMenu: 93,
    F1: 112,
    F10: 121,
  };
  const SHIFTED = { 0: ')', 1: '!', 2: '@', 3: '#', 4: '$', 5: '%', 6: '^' };

  /** Presses a key combination with real key events, e.g. `ctrl+b`, `ctrl+shift+2`, `shift+F10`. */
  const press = async (combo) => {
    const parts = combo.split('+');
    const k = parts.pop();
    const shift = parts.includes('shift');
    const modifiers =
      (parts.includes('alt') ? 1 : 0) | (parts.includes('ctrl') ? 2 : 0) | (shift ? 8 : 0);
    let key = k,
      code = k,
      vk = KEYS[k];
    if (/^\d$/.test(k)) [key, code, vk] = [shift ? SHIFTED[k] : k, `Digit${k}`, 48 + Number(k)];
    else if (/^[a-z]$/i.test(k))
      [key, code, vk] = [k.toLowerCase(), `Key${k.toUpperCase()}`, k.toUpperCase().charCodeAt(0)];
    if (vk === undefined) throw new Error(`Unknown key: ${k}`);
    const base = { key, code, modifiers, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk };
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...base });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', ...base });
    await wait(200);
  };

  /**
   * Saves a PNG screenshot. Half size by default: a full-size shot costs an agent about 3.5k
   * tokens to look at, and half size is enough to judge layout and colours.
   */
  const shot = async (path, scale = Number(process.env.SHOT_SCALE ?? 0.5)) => {
    const vp = await js('return { w: innerWidth, h: innerHeight };');
    const r = await send('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 0, y: 0, width: vp.w, height: vp.h, scale },
    });
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, Buffer.from(r.data, 'base64'));
    return path;
  };

  const S = 'window.__mdv.settings.getState()';
  const V = 'const v = window.__mdv.view.getState().editorView;';

  /** Sets a setting in memory only. */
  const setting = (key, value) =>
    js(`${S}.set(${JSON.stringify(key)}, ${JSON.stringify(value)}, { persist: false }); return 1;`);

  /** Opens a file through the document store. Refuses if the open document has unsaved changes. */
  const open = async (path) => {
    const dirty = await js(
      'const d = window.__mdv.document.getState(); return d.content !== d.savedContent;',
    );
    if (dirty)
      throw new Error(
        'The open document has unsaved changes; save or discard them in the app first.',
      );
    const ok = await js(
      `return await window.__mdv.document.getState().open(${JSON.stringify(path)});`,
    );
    await wait(700);
    return ok;
  };

  /** Replaces the editor text and selection, then focuses the editor (Source or Split view). */
  const setDoc = (text, anchor = 0, head = anchor) =>
    js(`${V} v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: ${JSON.stringify(text)} },
      selection: { anchor: ${anchor}, head: ${head} } }); v.focus(); return 1;`);

  const readDoc = () =>
    js(
      `${V} return { text: v.state.doc.toString(), from: v.state.selection.main.from, to: v.state.selection.main.to };`,
    );

  /** Puts the saved text back so the document isn't left dirty. */
  const restoreDoc = () =>
    js(`${V} if (!v) return 0; const saved = window.__mdv.document.getState().savedContent;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: saved } }); return 1;`);

  return {
    send,
    js,
    mouse,
    hover,
    center,
    click,
    press,
    shot,
    setting,
    open,
    setDoc,
    readDoc,
    restoreDoc,
    close: () => ws.close(),
  };
}

/** Collects PASS/FAIL lines; `done()` prints them and sets a failing exit code if any failed. */
export function reporter() {
  const lines = [];
  let failed = 0;
  return {
    check(name, ok, detail = '') {
      if (!ok) failed++;
      lines.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
    },
    note(text) {
      lines.push(`      ${text}`);
    },
    done() {
      lines.push(failed ? `${failed} failed` : 'all passed');
      console.log(lines.join('\n'));
      if (failed) process.exitCode = 1;
    },
  };
}
