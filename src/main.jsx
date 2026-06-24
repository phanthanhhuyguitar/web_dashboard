import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.jsx';
import './styles/global.css';
import './styles/login.css';
import './styles/dashboard.css';
import './styles/design-system.css';
import './styles/notifications.css';
import './styles/segments.css';
import './styles/organization.css';

const routerBasename = import.meta.env.BASE_URL === '/'
  ? undefined
  : import.meta.env.BASE_URL.replace(/\/$/, '');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={routerBasename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);
