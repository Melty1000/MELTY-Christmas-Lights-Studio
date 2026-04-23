import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import {
  Lightbulb,
  Heart,
  Settings as SettingsIcon,
  ExternalLink,
  Eye,
  EyeOff,
} from 'lucide-react';
import clsx from 'clsx';
import { useConfigStore } from '~/stores/useConfigStore.ts';

gsap.registerPlugin(useGSAP);

interface NavItem {
  to: string;
  label: string;
  icon: typeof Lightbulb;
  end?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Studio', icon: Lightbulb, end: true },
  { to: '/support', label: 'Support', icon: Heart },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
];

const PAGE_META: Record<string, { topbar: string }> = {
  '/': { topbar: 'Studio' },
  '/support': { topbar: 'Support' },
  '/settings': { topbar: 'Settings' },
};

const PREVIEW_WIDTH_KEY = 'melty.previewWidth';
const PREVIEW_VISIBLE_KEY = 'melty.previewVisible';
const PREVIEW_MIN_WIDTH = 280;
const PREVIEW_MAX_WIDTH = 900;
const PREVIEW_DEFAULT_WIDTH = 480;

const SIDEBAR_COLLAPSED = '64px';
const SIDEBAR_EXPANDED = '142px';
// Matches melty.lol GSAP `power2.inOut` feel.
const BRAND_EASE = 'cubic-bezier(0.455, 0.03, 0.515, 0.955)';
const SIDEBAR_HOVER_DELAY_MS = 100;
const SIDEBAR_EXPAND_MS = 500;
const SIDEBAR_COLLAPSE_MS = 370;
const SIDEBAR_UNHOVER_SPEED = 1.35;
const NAV_ICON_MS = 450;
const NAV_TEXT_EXPAND_MS = 360;
const NAV_TEXT_COLLAPSE_MS = 180;
const NAV_TEXT_REVEAL_DELAY_MS = 80;
const HAT_REVEAL_DELAY_MS = 90;

interface MeltShellProps {
  children: ReactNode;
}

export function MeltShell({ children }: MeltShellProps) {
  const location = useLocation();
  const connection = useConfigStore((s) => s.connection);
  const sbConnected = useConfigStore((s) => s.streamerbot.connected);

  const [expanded, setExpanded] = useState(false);
  const expandTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const sidebarTimelineRef = useRef<gsap.core.Timeline | null>(null);

  const [previewVisible, setPreviewVisible] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem(PREVIEW_VISIBLE_KEY);
    return stored === null ? true : stored === '1';
  });
  const [previewWidth, setPreviewWidth] = useState(() => {
    if (typeof window === 'undefined') return PREVIEW_DEFAULT_WIDTH;
    const stored = Number(window.localStorage.getItem(PREVIEW_WIDTH_KEY));
    if (!Number.isFinite(stored) || stored <= 0) return PREVIEW_DEFAULT_WIDTH;
    return Math.min(PREVIEW_MAX_WIDTH, Math.max(PREVIEW_MIN_WIDTH, stored));
  });
  const [isResizing, setIsResizing] = useState(false);
  const draggingRef = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PREVIEW_VISIBLE_KEY, previewVisible ? '1' : '0');
  }, [previewVisible]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(PREVIEW_WIDTH_KEY, String(previewWidth));
  }, [previewWidth]);

  const handleResizeStart = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    // Capture the pointer on the handle element. This guarantees we keep
    // receiving pointermove/up events even if the cursor crosses into the
    // iframe (which otherwise eats the events because it's a separate
    // document and the browser hands pointer focus to it).
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    draggingRef.current = true;
    setIsResizing(true);

    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current) return;
      const viewport = window.innerWidth;
      const next = Math.min(
        PREVIEW_MAX_WIDTH,
        Math.max(PREVIEW_MIN_WIDTH, viewport - e.clientX),
      );
      setPreviewWidth(next);
    };
    const onUp = (e: PointerEvent) => {
      draggingRef.current = false;
      setIsResizing(false);
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }, []);

  const activeKey = useMemo(() => {
    const exact = NAV_ITEMS.find((item) =>
      item.end ? location.pathname === item.to : location.pathname.startsWith(item.to),
    );
    return exact?.to ?? '/';
  }, [location.pathname]);

  useEffect(() => {
    const page = PAGE_META[activeKey];
    if (!page) return;
    document.title = `MELTY Lights // ${page.topbar}`;
  }, [activeKey]);

  useEffect(() => {
    return () => {
      if (expandTimeoutRef.current) {
        clearTimeout(expandTimeoutRef.current);
      }
    };
  }, []);

  useGSAP(
    () => {
      if (!shellRef.current) {
        return;
      }

      gsap.set(shellRef.current, { '--sidebar-width': SIDEBAR_COLLAPSED });
      const mainTimeline = gsap.timeline({
        paused: true,
        defaults: {
          duration: SIDEBAR_EXPAND_MS / 1000,
          ease: 'power2.inOut',
        },
      });
      mainTimeline.to(
        shellRef.current,
        {
          '--sidebar-width': SIDEBAR_EXPANDED,
          ease: 'power2.inOut',
        },
        0,
      );

      sidebarTimelineRef.current = mainTimeline;
      return () => {
        mainTimeline.kill();
        sidebarTimelineRef.current = null;
      };
    },
    { scope: shellRef },
  );

  useEffect(() => {
    const timeline = sidebarTimelineRef.current;
    if (!timeline) {
      return;
    }

    if (expanded) {
      timeline.timeScale(1).play();
      return;
    }

    timeline.timeScale(SIDEBAR_UNHOVER_SPEED).reverse();
  }, [expanded]);

  const page = PAGE_META[activeKey] ?? { topbar: 'Command' };
  const activeIndex = NAV_ITEMS.findIndex((item) => item.to === activeKey);
  const apiTone =
    connection === 'connected' ? 'good' : connection === 'connecting' ? 'warn' : 'neutral';
  const shellTransitionMs = expanded ? SIDEBAR_EXPAND_MS : SIDEBAR_COLLAPSE_MS;

  function handleSidebarEnter() {
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
    }
    expandTimeoutRef.current = setTimeout(() => setExpanded(true), SIDEBAR_HOVER_DELAY_MS);
  }

  function handleSidebarLeave() {
    if (expandTimeoutRef.current) {
      clearTimeout(expandTimeoutRef.current);
    }
    setExpanded(false);
  }

  return (
    <div
      ref={shellRef}
      className="grid h-screen w-screen overflow-hidden bg-melt-frame text-melt-text-body select-none"
      style={{
        gridTemplateColumns: SIDEBAR_COLLAPSED + ' 1fr',
        gridTemplateRows: '40px 1fr',
      }}
    >
      <div
        className="col-start-1 row-start-1 row-span-2 relative z-[55]"
        style={{ width: 'var(--sidebar-width, 64px)' }}
        onMouseEnter={handleSidebarEnter}
        onMouseLeave={handleSidebarLeave}
      >
        <NavLink
          to="/"
          className="absolute inset-x-0 top-0 h-[72px] drag-region z-[60] branding-overlay flex items-center justify-center cursor-pointer pointer-events-auto no-drag no-underline"
        >
          <div className="logo-container h-12 w-[64px] max-w-[64px] relative grid place-items-center overflow-visible">
            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <img
                src="/assets/melty-face.png"
                alt="Melty face"
                className={clsx(
                  'logo-main z-20 h-12 w-12 object-contain transition-transform',
                  expanded ? 'scale-[1.4] translate-y-[4px]' : 'scale-[1.55]',
                )}
                style={{
                  gridArea: '1 / 1',
                }}
                loading="eager"
                decoding="sync"
              />
            </div>

            <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
              <img
                src="/assets/santa-hat.svg"
                alt=""
                aria-hidden="true"
                className={clsx(
                  'logo-hat h-12 w-auto object-contain z-30 transition-all',
                  expanded
                    ? '-translate-x-[8px] -translate-y-[30px] -rotate-[14deg] scale-[1.45] opacity-100'
                    : 'translate-x-[3px] -translate-y-[42px] -rotate-[22deg] scale-[1.45] opacity-0',
                )}
                style={{
                  gridArea: '1 / 1',
                  transitionDuration: `${shellTransitionMs}ms`,
                  transitionTimingFunction: BRAND_EASE,
                  transitionDelay: expanded ? `${HAT_REVEAL_DELAY_MS}ms` : '0ms',
                }}
                loading="eager"
                decoding="sync"
              />
            </div>
          </div>
        </NavLink>

        <aside
          className="flex h-full flex-col bg-melt-frame transition-colors duration-300"
          style={{ width: 'var(--sidebar-width, 64px)' }}
        >
          <div className="h-[72px] w-full mb-0" />

          <nav className="relative flex flex-1 flex-col px-3">
            <div
              className="selection-drip pointer-events-none absolute inset-x-3 h-10 rounded-md bg-melt-accent transition-transform duration-500"
              style={{
                transform: activeIndex >= 0 ? `translateY(${activeIndex * 44}px)` : undefined,
                opacity: activeIndex >= 0 ? 1 : 0,
                visibility: activeIndex >= 0 ? 'visible' : 'hidden',
                transitionDuration: `${shellTransitionMs}ms`,
                transitionTimingFunction: BRAND_EASE,
              }}
            />

            <ul className="space-y-1">
              {NAV_ITEMS.map((item) => (
                <li key={item.to}>
                  <SidebarNavItem item={item} expanded={expanded} active={activeKey === item.to} />
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col items-center space-y-1 px-3 pb-4">
            <div className="mb-2 h-px w-full bg-melt-text-muted/10 opacity-30" />
            <div className="h-3 w-full overflow-hidden text-center text-label-2xs tracking-widest text-melt-text-muted">
              {expanded ? 'V 2026 COMMAND' : 'V26'}
            </div>
          </div>
        </aside>
      </div>

      <header className="col-start-2 row-start-1 flex items-center bg-melt-frame pr-3">
        <div className="flex-shrink-0" style={{ marginLeft: 'calc(var(--sidebar-width) - 64px)' }}>
          <span className="ml-6 text-label-xs tracking-[0.3em] text-melt-text-muted">
            MELTY.LOL // {page.topbar.toUpperCase()}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <HeaderPill label={`API ${connection}`} tone={apiTone} />
          <HeaderPill
            label={sbConnected ? 'SB ONLINE' : 'SB OFFLINE'}
            tone={sbConnected ? 'good' : 'neutral'}
          />
          <button
            type="button"
            onClick={() => setPreviewVisible((prev) => !prev)}
            title={previewVisible ? 'Hide live preview' : 'Show live preview'}
            className="flex h-8 items-center gap-2 rounded-full border border-melt-text-muted/10 bg-melt-surface/30 px-3 text-[9px] font-black tracking-[0.24em] uppercase text-melt-text-label transition-colors duration-200 hover:border-melt-accent/30 hover:text-melt-text-heading"
          >
            {previewVisible ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
            <span className="hidden md:inline">{previewVisible ? 'Hide Preview' : 'Show Preview'}</span>
          </button>
          <button
            type="button"
            onClick={() => window.open('/overlay', '_blank', 'noopener,noreferrer')}
            className="flex h-8 items-center gap-2 rounded-full border border-melt-text-muted/10 bg-melt-surface/30 px-4 text-[9px] font-black tracking-[0.24em] uppercase text-melt-text-label transition-colors duration-200 hover:border-melt-accent/30 hover:text-melt-text-heading"
          >
            <ExternalLink className="size-3 text-melt-accent" />
            <span className="hidden sm:inline">Open Overlay</span>
          </button>
        </div>
      </header>

      <main
        className="col-start-2 row-start-2 flex min-w-[calc(100vw-64px)] overflow-hidden rounded-tl-[32px] bg-melt-surface shadow-[0_0_0_1px_rgba(255,255,255,0.01)]"
        style={{ marginLeft: 'calc(var(--sidebar-width) - 64px)' }}
      >
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <PageHeader title={page.topbar} />
          <div className="relative flex-1 overflow-y-auto overflow-x-hidden px-6 pb-8 pt-4">
            {children}
          </div>
        </div>

        {previewVisible ? (
          <>
            <div
              onPointerDown={handleResizeStart}
              className={clsx(
                'group relative w-1 shrink-0 touch-none cursor-col-resize transition-colors',
                isResizing
                  ? 'bg-melt-accent/60'
                  : 'bg-melt-text-muted/5 hover:bg-melt-accent/40',
              )}
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize preview"
            >
              {/* Invisible hit target that extends the handle on both sides so
                  users don't need pixel-perfect aim. */}
              <div className="absolute inset-y-0 -left-2 -right-2" />
            </div>
            <PreviewPane width={previewWidth} suppressPointer={isResizing} />
          </>
        ) : null}
      </main>
    </div>
  );
}

function PreviewPane({
  width,
  suppressPointer,
}: {
  width: number;
  suppressPointer: boolean;
}) {
  return (
    <aside
      className="flex shrink-0 flex-col border-l border-melt-text-muted/10 bg-melt-frame/50"
      style={{ width }}
    >
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-melt-text-muted/10 px-3">
        <div className="flex items-center gap-2">
          <span className="size-1.5 rounded-full bg-emerald-400/80 shadow-[0_0_8px] shadow-emerald-400/60" />
          <span className="text-[9px] font-black tracking-[0.22em] uppercase text-melt-text-muted">
            Live Preview
          </span>
        </div>
        <a
          href="/overlay"
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-6 items-center gap-1 rounded border border-melt-text-muted/10 px-2 text-[9px] font-black tracking-[0.18em] uppercase text-melt-text-label transition-colors hover:border-melt-accent/40 hover:text-melt-accent"
          title="Pop out overlay"
        >
          <ExternalLink className="size-3" />
          Pop Out
        </a>
      </div>
      <div className="relative flex-1 overflow-hidden bg-[#05090f]">
        <iframe
          title="Overlay preview"
          src="/overlay"
          className="size-full border-0"
          allow="autoplay"
        />
        {/* During a resize drag we cover the iframe with a transparent shield
            so the cursor never slips into the sub-document and steals the
            pointer stream — otherwise the parent stops receiving
            pointermove events as soon as you cross the handle rightward. */}
        {suppressPointer ? (
          <div className="absolute inset-0 cursor-col-resize" aria-hidden />
        ) : null}
      </div>
    </aside>
  );
}

function SidebarNavItem({
  item,
  expanded,
  active,
}: {
  item: NavItem;
  expanded: boolean;
  active: boolean;
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) =>
        clsx(
          'nav-item group relative flex h-10 items-center justify-center overflow-hidden rounded-md transition-colors duration-200',
          isActive ? 'text-melt-frame' : 'text-melt-text-label hover:text-melt-text-heading',
        )
      }
    >
      <div
        className={clsx(
          'nav-icon-wrapper absolute top-1/2 left-5 -translate-x-1/2 -translate-y-1/2 origin-center transition-all',
          active ? 'scale-[1.25] -rotate-[10deg]' : 'scale-100 rotate-0',
          !active && 'group-hover:left-1/2 group-hover:scale-[1.55] group-hover:-rotate-[8deg]',
        )}
        style={{
          transitionDuration: `${NAV_ICON_MS}ms`,
          transitionTimingFunction: BRAND_EASE,
        }}
      >
        <item.icon className="size-5" strokeWidth={2.5} />
      </div>

      <span
        className={clsx(
          'nav-text absolute inset-y-0 left-[34px] right-[2px] flex items-center overflow-hidden pointer-events-none transition-all',
          expanded ? 'visible translate-x-0 opacity-100' : 'invisible translate-x-5 opacity-0',
          expanded && !active && 'group-hover:translate-x-8 group-hover:opacity-0',
        )}
        style={{
          transitionDuration: expanded ? `${NAV_TEXT_EXPAND_MS}ms` : `${NAV_TEXT_COLLAPSE_MS}ms`,
          transitionTimingFunction: BRAND_EASE,
          transitionDelay: expanded ? `${NAV_TEXT_REVEAL_DELAY_MS}ms` : '0ms',
        }}
      >
        <span className="inline-block w-max max-w-none box-border pr-1 text-[10px] font-black tracking-[0.28em] uppercase whitespace-nowrap">
          {item.label}
        </span>
      </span>
    </NavLink>
  );
}

function PageHeader({ title }: { title: string }) {
  return (
    <header className="flex shrink-0 items-center gap-4 px-6 pt-4 pb-2">
      <div className="text-[11px] font-black tracking-[0.28em] uppercase text-melt-text-heading">
        {title}
      </div>
      <div className="h-px flex-1 bg-melt-text-muted/10" />
    </header>
  );
}

function HeaderPill({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'warn';
}) {
  return (
    <span
      className={clsx(
        'inline-flex h-8 items-center rounded-full border px-4 text-[9px] font-black tracking-[0.22em] uppercase',
        tone === 'neutral' && 'border-melt-text-muted/10 bg-melt-surface/30 text-melt-text-label',
        tone === 'good' && 'border-emerald-400/25 bg-emerald-400/12 text-emerald-100',
        tone === 'warn' && 'border-melt-accent/30 bg-melt-accent/10 text-melt-accent',
      )}
    >
      {label}
    </span>
  );
}
