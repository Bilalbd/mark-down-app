#!/usr/bin/env node
/**
 * Dev helper: evaluate JavaScript inside the running Tauri app's WebView2 via the
 * Chrome DevTools Protocol. Requires the app to be launched with
 *   WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222
 *
 * Usage:
 *   node scripts/cdp.mjs eval "document.title"
 *   node scripts/cdp.mjs eval-file path/to/snippet.js
 *   node scripts/cdp.mjs screenshot out.png
 */
const PORT = process.env.CDP_PORT ?? '9222';
const [cmd, arg] = process.argv.slice(2);

async function getPageWs() {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
  const page = list.find((t) => t.type === 'page' && t.url.startsWith('http://localhost:1420'));
  if (!page) throw new Error('App page not found. Targets: ' + list.map((t) => t.url).join(', '));
  return page.webSocketDebuggerUrl;
}

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const msgId = ++id;
            pending.set(msgId, { res, rej });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          }),
        close: () => ws.close(),
      });
    ws.onerror = reject;
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { res, rej } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? rej(new Error(msg.error.message)) : res(msg.result);
      }
    };
  });
}

const cdp = await connect(await getPageWs());
try {
  if (cmd === 'eval' || cmd === 'eval-file') {
    const expression = cmd === 'eval' ? arg : (await import('node:fs')).readFileSync(arg, 'utf8');
    const r = await cdp.send('Runtime.evaluate', {
      expression: `(async () => { ${expression.includes('return ') ? expression : 'return (' + expression + ')'} })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails) {
      console.error('Exception:', r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
      process.exitCode = 1;
    } else {
      console.log(JSON.stringify(r.result.value, null, 2));
    }
  } else if (cmd === 'screenshot') {
    const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
    (await import('node:fs')).writeFileSync(arg, Buffer.from(r.data, 'base64'));
    console.log('saved', arg);
  } else {
    console.error('Unknown command');
    process.exitCode = 1;
  }
} finally {
  cdp.close();
}
