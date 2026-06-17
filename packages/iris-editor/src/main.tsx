import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from 'sonner';
import './styles/iris-theme.css';
import { LocalApp } from './local/LocalApp';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LocalApp />
    <Toaster theme="dark" position="bottom-right" />
  </StrictMode>,
);
