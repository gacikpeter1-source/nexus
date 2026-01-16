/**
 * Brand Configuration
 * Based on: docs/13-design-system.md
 */

export const BRAND = {
  name: 'Nexus',
  fullName: 'Nexus Club Manager',
  tagline: 'Manage your team effortlessly',
  
  colors: {
    // Primary - Royal Blue
    primary: '#4169E1',
    primaryLight: '#60a5fa',
    primaryDark: '#1e40af',
    
    // Accent - Orange
    accent: '#FF8C00',
    accentLight: '#fb923c',
    accentDark: '#ea580c',
    
    // Background & Text
    background: '#FFFFFF',
    backgroundDark: '#1f2937',
    text: '#1a1a1a',
    textLight: '#666666',
    textDark: '#f9fafb',
    
    // Semantic Colors
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  },
  
  breakpoints: {
    xs: 375,      // Mobile small
    sm: 640,      // Mobile large
    md: 768,      // Tablet
    lg: 1024,     // Desktop
    xl: 1280,     // Large desktop
    '2xl': 1536,  // Ultrawide
    '3xl': 2560,  // 4K ultrawide
  },
  
  spacing: {
    mobile: '16px',
    tablet: '24px',
    desktop: '32px',
  },
  
  typography: {
    // Font families
    fontSans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Roboto", "Oxygen", "Ubuntu", "Cantarell", "Fira Sans", "Droid Sans", "Helvetica Neue", sans-serif',
    fontMono: '"Fira Code", "Courier New", Courier, monospace',
    
    // Max line length for readability
    maxCharsPerLine: 75,
  },
} as const;

export type Brand = typeof BRAND;

