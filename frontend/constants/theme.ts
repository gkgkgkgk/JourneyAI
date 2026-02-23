/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * "Inkwell" theme — warm parchment light mode, deep navy dark mode.
 * Ink-blue accent (Blue-700/400) instead of flat indigo for a classier literary feel.
 */

import { Platform } from 'react-native';

const tintColorLight = '#1D4ED8'; // Blue-700 — classic ink blue
const tintColorDark = '#60A5FA';  // Blue-400 — bright but refined

export const Colors = {
  light: {
    text: '#1A1C2E',       // Deep ink-navy
    background: '#F4F0E8', // Warm parchment — not stark white
    tint: tintColorLight,
    icon: '#78716C',       // Stone-gray (warm)
    tabIconDefault: '#A8A29E', // Stone-400
    tabIconSelected: tintColorLight,
    border: '#DDD5C4',     // Warm tan — clearly separates panels
    card: '#FEFCF8',       // Warm white — visibly distinct from background
    primary: '#1D4ED8',    // Blue-700
    secondary: '#6B7280',  // Cool-warm gray
    success: '#166534',    // Deep forest green — refined
    warning: '#B45309',    // Amber-700 — darker, more editorial
    error: '#991B1B',      // Red-800 — deep, not garish
  },
  dark: {
    text: '#EDE9DF',       // Warm off-white — easier on the eyes than cold white
    background: '#0D1520', // Deep navy-black
    tint: tintColorDark,
    icon: '#8B9BB0',       // Slightly warm slate
    tabIconDefault: '#64748B', // Slate-500
    tabIconSelected: tintColorDark,
    border: '#263347',     // Clearly between card and background in brightness
    card: '#182030',       // Distinctly lighter than background — fixes section blur
    primary: '#60A5FA',    // Blue-400
    secondary: '#94A3B8',  // Slate-400
    success: '#34D399',    // Emerald-400
    warning: '#FBBF24',    // Amber-400
    error: '#F87171',      // Red-400
  },
};

// Two fonts, clear purpose:
// heading — Playfair Display: use for titles, display text, and reading content
// body    — DM Sans: use for all UI chrome (labels, buttons, nav, captions)
export const Fonts = Platform.select({
  ios: {
    heading: 'Georgia',
    body: 'System',
  },
  default: {
    heading: 'serif',
    body: 'sans-serif',
  },
  web: {
    heading: "'Playfair Display', Charter, Georgia, serif",
    body: "'DM Sans', Inter, -apple-system, BlinkMacSystemFont, sans-serif",
  },
});
