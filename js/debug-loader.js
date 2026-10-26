// FlipTheSAA — Optional debug mode for the owner's local server (private testing; inert everywhere else)
//
// Does nothing unless BOTH are true: the page runs on this computer (localhost / 127.0.0.1) and the owner switched
// debug on in this browser. Switch on: open the site once with ?debug=on, off: ?debug=off.
// The logging itself lives in js/debug.local.js, which is git-ignored, so it is never deployed. If that file is
// missing (as on the live site) the app starts normally.
const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]'];
const FLAG = 'saa_debug';

if (LOCAL_HOSTS.includes(location.hostname)) {
  try {
    const url = new URL(location.href);
    const requested = url.searchParams.get('debug');
    if (requested === 'on' || requested === 'off') {
      if (requested === 'on') localStorage.setItem(FLAG, '1');
      else { localStorage.removeItem(FLAG); sessionStorage.removeItem('saa_debug_log_v1'); }
      url.searchParams.delete('debug');
      history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
    if (localStorage.getItem(FLAG) === '1') await import('./debug.local.js').catch(() => {});
  } catch { /* storage blocked: no debug mode */ }
}
