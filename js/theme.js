// FlipTheSAA — Light / dark theme

// ============================================================================
// THEME - Light / dark toggle (system preference until the user picks one)
// ============================================================================

export const THEME_KEY = "saa_theme_v1"; // localStorage key for the theme choice

export function currentTheme() {
  const explicit = document.documentElement.getAttribute('data-theme');
  if (explicit === 'light' || explicit === 'dark') return explicit;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function syncThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;
  btn.setAttribute('aria-label', currentTheme() === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
}
