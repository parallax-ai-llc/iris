import React from 'react';
import ReactDOM from 'react-dom/client';
import '@/shared/lib/i18n'; // i18n 초기화 (앱 진입점에서 가장 먼저 실행)
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
