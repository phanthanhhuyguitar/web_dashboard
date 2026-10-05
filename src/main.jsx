import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import ErrorBoundary from './components/common/ErrorBoundary.jsx';
import { AppSettingsProvider, readStoredSettings } from './context/AppSettingsContext.jsx';
import { applyTheme } from './hooks/useTheme.js';
import './styles/global.css';
import './styles/login.css';
import './styles/dashboard.css';
import './styles/design-system.css';
import './styles/notifications.css';
import './styles/segments.css';
import './styles/organization.css';
import './styles/reconciliations.css';
import './styles/dataQuality.css';
import './styles/assistant.css';

const routerBasename = import.meta.env.BASE_URL === '/'
  ? undefined
  : import.meta.env.BASE_URL.replace(/\/$/, '');

// Ap theme ngay truoc khi render de tranh nhay sang (FOUC) khi user da chon dark mode truoc do.
applyTheme(readStoredSettings().theme);

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter basename={routerBasename}>
        <AppSettingsProvider>
          <App />
        </AppSettingsProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
