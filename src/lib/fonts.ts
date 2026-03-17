// Font definitions for Nerve UI

export type FontName = 'inter' | 'jetbrains-mono' | 'system';

export interface Font {
  name: FontName;
  label: string;
  family: string;
  googleFontsUrl?: string; // URL for lazy-loading from Google Fonts
}

export const fonts: Record<FontName, Font> = {
  'inter': {
    name: 'inter',
    label: 'Inter',
    family: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  },
  'jetbrains-mono': {
    name: 'jetbrains-mono',
    label: 'JetBrains Mono',
    family: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    googleFontsUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700&display=swap',
  },
  'system': {
    name: 'system',
    label: 'System Default',
    family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
};

/** All available font names as a typed array. */
export const fontNames = Object.keys(fonts) as FontName[];

/** Monospace font stack for code blocks (always used regardless of UI font setting). */
export const monoFont = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace";

// Track which fonts have been loaded
const loadedFonts = new Set<string>();

// Lazy-load a font from Google Fonts
function loadGoogleFont(url: string): void {
  if (loadedFonts.has(url)) return;
  
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = url;
  document.head.appendChild(link);
  loadedFonts.add(url);
}

/** Apply a font to the document root by setting CSS custom properties and lazy-loading from Google Fonts. */
export function applyFont(fontName: FontName): void {
  const font = fonts[fontName];
  if (!font) return;
  
  // Lazy-load the font if it has a Google Fonts URL
  if (font.googleFontsUrl) {
    loadGoogleFont(font.googleFontsUrl);
  }
  
  const root = document.documentElement;
  
  // Set the UI font (--font-sans variable)
  root.style.setProperty('--font-sans', font.family);
  
  // Keep monospace font for code blocks unchanged
  root.style.setProperty('--font-mono', monoFont);
}

// Initialize: load JetBrains Mono (default UI + code font)
loadGoogleFont(fonts['jetbrains-mono'].googleFontsUrl!);
