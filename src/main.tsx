import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles/app-theme.css';
import './styles/base.css';

if (import.meta.env.DEV) {
  // Dev-only handles for driving the app from the browser console / automated checks.
  void Promise.all([import('./store/document'), import('./store/settings')]).then(
    ([doc, settings]) => {
      (window as unknown as { __mdv: unknown }).__mdv = {
        document: doc.useDocumentStore,
        settings: settings.useSettingsStore,
      };
    },
  );
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
