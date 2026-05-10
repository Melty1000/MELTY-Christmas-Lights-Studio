import { lazy, StrictMode, Suspense, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider, createBrowserRouter } from 'react-router-dom';
import './styles/index.css';
import { loadMeltTheme } from './lib/theme.ts';
import { STUDIO_TABS } from './lib/studioTabs.ts';

const ControlPanel = lazy(() => import('./routes/ControlPanel.tsx').then((module) => ({ default: module.ControlPanel })));
const Overlay = lazy(() => import('./routes/Overlay.tsx').then((module) => ({ default: module.Overlay })));
const Studio = lazy(() => import('./pages/Studio.tsx').then((module) => ({ default: module.Studio })));
const Support = lazy(() => import('./pages/Support.tsx').then((module) => ({ default: module.Support })));
const Settings = lazy(() => import('./pages/Settings.tsx').then((module) => ({ default: module.Settings })));

function route(element: ReactNode) {
  return <Suspense fallback={null}>{element}</Suspense>;
}

loadMeltTheme();

const router = createBrowserRouter([
  {
    path: '/',
    element: route(<ControlPanel />),
    children: [
      ...STUDIO_TABS.map((tab) =>
        tab.path
          ? { path: tab.path, element: route(<Studio />) }
          : { index: true, element: route(<Studio />) },
      ),
      { path: 'support', element: route(<Support />) },
      { path: 'settings', element: route(<Settings />) },
    ],
  },
  {
    path: '/overlay',
    element: route(<Overlay />),
  },
]);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
