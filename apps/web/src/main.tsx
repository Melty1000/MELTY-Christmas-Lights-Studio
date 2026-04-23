import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import './styles/index.css';
import { ControlPanel } from './routes/ControlPanel.tsx';
import { Overlay } from './routes/Overlay.tsx';
import { loadMeltTheme } from './lib/theme.ts';
import { Studio } from './pages/Studio.tsx';
import { Support } from './pages/Support.tsx';
import { Settings } from './pages/Settings.tsx';

loadMeltTheme();

const router = createBrowserRouter([
  {
    path: '/',
    element: <ControlPanel />,
    children: [
      { index: true, element: <Studio /> },
      { path: 'support', element: <Support /> },
      { path: 'settings', element: <Settings /> },
    ],
  },
  {
    path: '/overlay',
    element: <Overlay />,
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
