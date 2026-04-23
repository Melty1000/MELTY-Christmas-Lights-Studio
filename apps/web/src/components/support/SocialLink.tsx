import type { ComponentType, SVGProps } from 'react';
import { useRef, useState } from 'react';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';

// Ported from melty.lol with minor edits for the studio environment.
type IconComponent = ComponentType<SVGProps<SVGSVGElement> & { size?: number }>;

interface SocialLinkProps {
  label: string;
  icon: IconComponent;
  href: string;
  color?: string;
  maxWidth?: number;
}

export function SocialLink({
  label,
  icon: Icon,
  href,
  color = 'var(--melt-accent)',
  maxWidth = 400,
}: SocialLinkProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const iconRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const bgRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const isFirstRender = useRef(true);

  useGSAP(
    () => {
      if (isHovered) {
        gsap.to(textRef.current, {
          x: 40,
          opacity: 0,
          duration: 0.4,
          ease: 'power2.out',
          overwrite: 'auto',
        });
        gsap.to(iconRef.current, {
          top: '50%',
          yPercent: -50,
          left: '50%',
          xPercent: -50,
          scale: 1.55,
          rotate: -8,
          duration: 0.5,
          ease: 'back.out(1.7)',
          color: 'var(--melt-surface)',
          overwrite: 'auto',
        });
        gsap.to(bgRef.current, { opacity: 1, duration: 0.3, overwrite: 'auto' });
        gsap.to(linkRef.current, {
          color: 'var(--melt-surface)',
          duration: 0.3,
          overwrite: 'auto',
        });
      } else {
        const method = isFirstRender.current ? gsap.set : gsap.to;
        const dur = isFirstRender.current ? {} : { duration: 0.5, ease: 'power2.inOut' };
        const durShort = isFirstRender.current ? {} : { duration: 0.3 };
        isFirstRender.current = false;

        method(textRef.current, { x: 0, opacity: 1, overwrite: 'auto', ...dur });
        method(iconRef.current, {
          top: '50%',
          yPercent: -50,
          left: '16px',
          xPercent: 0,
          scale: 1.55,
          rotate: 0,
          color,
          overwrite: 'auto',
          ...dur,
        });
        method(bgRef.current, { opacity: 0, overwrite: 'auto', ...durShort });
        method(linkRef.current, {
          color: 'var(--melt-text-label)',
          overwrite: 'auto',
          ...durShort,
        });
      }
    },
    { dependencies: [isHovered, maxWidth, color], scope: containerRef },
  );

  return (
    <div
      ref={containerRef}
      style={{ width: maxWidth }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative flex h-[52px] shrink-0 items-center justify-center will-change-[width]"
    >
      <a
        ref={linkRef}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group/link relative flex h-full w-full cursor-pointer items-center overflow-hidden rounded-2xl p-0 outline-none transition-colors"
        style={{ backgroundColor: 'transparent' }}
      >
        <div
          ref={bgRef}
          className="pointer-events-none absolute inset-0 opacity-0"
          style={{ backgroundColor: color }}
        />
        <div className="pointer-events-none absolute inset-y-0 right-6 flex items-center justify-end">
          <div
            ref={textRef}
            className="text-[10px] font-black uppercase tracking-[0.3em] opacity-80"
          >
            {label}
          </div>
        </div>
        <div
          ref={iconRef}
          className="pointer-events-none absolute left-4 top-1/2 origin-center -translate-y-1/2"
          style={{ color }}
        >
          <Icon width={18} height={18} />
        </div>
      </a>
    </div>
  );
}
