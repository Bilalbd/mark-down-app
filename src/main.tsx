import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app-theme.css';
import './styles/base.css';
import 'katex/dist/katex.min.css';
import { emitAppReady } from './lib/tauri';

if (import.meta.env.DEV) {
  // Dev-only handles for driving the app from the browser console / automated checks.
  void Promise.all([
    import('./store/document'),
    import('./store/settings'),
    import('./store/view'),
    import('./store/style'),
    import('./markdown/render'),
  ]).then(([doc, settings, view, style, render]) => {
    (window as unknown as { __mdv: unknown }).__mdv = {
      document: doc.useDocumentStore,
      settings: settings.useSettingsStore,
      view: view.useViewStore,
      style: style.useStyleStore,
      render: render.renderMarkdown,
    };
  });
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// The app itself calls emitAppReady once settings/styles are loaded and any launch
// file is open, so the window only appears once it's actually themed correctly. This
// is just a safety net in case that never happens (e.g. an error during startup).
setTimeout(emitAppReady, 1500);
