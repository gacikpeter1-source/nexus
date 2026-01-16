import { ReactNode } from 'react';

interface ContainerProps {
  children: ReactNode;
  className?: string;
}

/**
 * Responsive Container Component
 * Based on: docs/13-design-system.md - Content Width Strategy
 * 
 * Width Strategy:
 * - Mobile (<768px): Full width, 16-24px padding
 * - Tablet (768-1024px): Centered, max 720px
 * - Desktop (1024-1440px): Centered, max 960px
 * - Large (1440px+): Centered, max 1200px
 * - Ultrawide (2560px+): 50-60% viewport width
 */
export default function Container({ children, className = '' }: ContainerProps) {
  return (
    <div
      className={`
        w-full 
        px-4 md:px-6 lg:px-8
        mx-auto
        max-w-full 
        sm:max-w-screen-sm 
        md:max-w-[720px]
        lg:max-w-[960px]
        xl:max-w-[1200px]
        2xl:max-w-[1200px]
        3xl:max-w-[60vw]
        ${className}
      `.trim().replace(/\s+/g, ' ')}
    >
      {children}
    </div>
  );
}

