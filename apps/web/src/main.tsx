import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import './styles/index.css';
import { ControlPanel } from './routes/ControlPanel.tsx';
import { Overlay } from './routes/Overlay.tsx';
import { loadMeltTheme } from './lib/theme.ts';
import { Bulbs } from './pages/Bulbs.tsx';
import { Wires } from './pages/Wires.tsx';
import { Effects } from './pages/Effects.tsx';
import { Environment } from './pages/Environment.tsx';
import { Presets } from './pages/Presets.tsx';
import { Settings } from './pages/Settings.tsx';

loadMeltTheme();

const router = createBrowserRouter([
  {
    path: '/',
    element: <ControlPanel />,
    children: [
      { index: true, element: <Bulbs /> },
      { path: 'wires', element: <Wires /> },
      { path: 'effects', element: <Effects /> },
      { path: 'environment', element: <Environment /> },
      { path: 'presets', element: <Presets /> },
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
