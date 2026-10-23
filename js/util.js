// FlipTheSAA — Small helpers: error wrapper, seeded shuffle, escaping, icons, dialog, fetch

// ============================================================================
// ERROR HANDLING - Safe operation wrapper for debugging
// ============================================================================

/**
 * WHAT IT DOES: Safely executes functions and catches any errors that occur
 *
 * WHY WE NEED IT: Prevents the entire app from crashing when something goes
 * wrong. Instead of a blank screen, we log helpful error info to the console
 * and return a fallback value so the app can continue running.
 *
 * PARAMETERS:
 * - operationName: String describing what we're trying to do (for logging)
 * - fn: The function to execute safely
 * - fallbackValue: What to return if the function throws an error
 *
 * RETURNS: Either the result of fn() or the fallbackValue if error occurs
 *
 * SIDE EFFECTS: Logs detailed error information to browser console
 *
 * EXAMPLE:
 * const data = safeOperation('Load State', () => JSON.parse(localStorage.getItem('key')), null);
 */
export function safeOperation(operationName, fn, fallbackValue) {
  try {
    return fn();
  } catch (error) {
    // Log detailed error info to console with timestamp for debugging
    console.error(`[SAA Error] ${operationName}:`, {
      message: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    return fallbackValue;
  }
}

// ============================================================================
// UTILITY FUNCTIONS - Simple helper functions
// ============================================================================

/**
 * WHAT IT DOES: Normalizes quiz mode to only "review" or "timed"
 *
 * WHY WE NEED IT: Maintains backward compatibility with old "practice" mode
 * while ensuring only two valid modes exist in the new system.
 *
 * PARAMETERS:
 * - mode: String representing the mode (could be "review", "timed", "practice", or anything)
 *
 * RETURNS: Either "timed" or "review" (default)
 *
 * EXAMPLE:
 * normalizeMode("practice") → "review"
 * normalizeMode("timed") → "timed"
 * normalizeMode("anything-else") → "review"
 */
export function normalizeMode(mode) {
  return mode === "timed" ? "timed" : "review";
}

/**
 * WHAT IT DOES: Gets the current timestamp in milliseconds
 *
 * WHY WE NEED IT: Used for timer calculations, session timestamps,
 * and generating unique session seeds
 *
 * RETURNS: Number of milliseconds since January 1, 1970 (Unix epoch)
 */
export function nowMs() {
  return Date.now();
}

// ============================================================================
// DETERMINISTIC SHUFFLE - Seeded random number generation
// ============================================================================
// WHY WE NEED THIS: We want questions to appear in a random order, BUT the
// same order every time you reload the page during a session. This is called
// "deterministic randomness" - random but reproducible.
//
// HOW IT WORKS:
// 1. Take a unique string (session key + timestamp)
// 2. Convert it to a number (seed)
// 3. Use that seed to generate "random" numbers (same seed = same numbers)
// 4. Use those numbers to shuffle the questions
// Result: Questions appear random but stay in the same order on page refresh!

/**
 * WHAT IT DOES: Creates a pseudo-random number generator (PRNG) from a seed
 *
 * WHY WE NEED IT: JavaScript's Math.random() gives different results every
 * time, but we need the SAME "random" sequence for a given session.
 *
 * HOW IT WORKS: Uses the Mulberry32 algorithm - a fast, simple PRNG that
 * produces high-quality pseudo-random numbers from a 32-bit seed.
 *
 * PARAMETERS:
 * - seed: A 32-bit integer that determines the sequence of random numbers
 *
 * RETURNS: A function that returns pseudo-random numbers between 0 and 1
 *
 * EXAMPLE:
 * const rng = mulberry32(12345);
 * rng() → 0.2347... (always the same for seed 12345)
 * rng() → 0.8912... (second call, also always the same)
 */
export function mulberry32(seed) {
  return function () {
    // Mulberry32 algorithm (32-bit PRNG)
    // These magic numbers and bit operations create high-quality randomness
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    // Convert 32-bit integer to 0-1 range by dividing by 2^32
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * WHAT IT DOES: Converts a string into a 32-bit number (hash)
 *
 * WHY WE NEED IT: The shuffle algorithm needs a numeric seed, but we have
 * a string session key. This converts "review::D1::ALL" into a number.
 *
 * HOW IT WORKS: Uses FNV-1a hash algorithm to convert any string into a
 * consistent 32-bit integer. Same string always produces same number.
 *
 * PARAMETERS:
 * - str: Any string (e.g., "review::D1::ALL::1735142400000")
 *
 * RETURNS: A 32-bit unsigned integer (0 to 4,294,967,295)
 *
 * EXAMPLE:
 * hashStringToSeed("review::D1::ALL") → 2847563928 (always the same)
 */
export function hashStringToSeed(str) {
  // FNV-1a hash algorithm for strings
  let h = 2166136261; // FNV offset basis (32-bit)
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);  // XOR with character code
    h = Math.imul(h, 16777619);  // Multiply by FNV prime
  }
  return h >>> 0;  // Convert to unsigned 32-bit integer
}

/**
 * WHAT IT DOES: Shuffles an array in a deterministic (reproducible) way
 *
 * WHY WE NEED IT: Questions need to be randomized, but stay in the same
 * order when you refresh the page during a session.
 *
 * HOW IT WORKS: Uses Fisher-Yates shuffle algorithm with our seeded RNG
 * instead of Math.random(). Same seed string = same shuffle order.
 *
 * PARAMETERS:
 * - arr: Array to shuffle (we don't modify the original)
 * - seedStr: String that determines the shuffle order
 *
 * RETURNS: New shuffled array (original array is not modified)
 *
 * EXAMPLE:
 * seededShuffle([1,2,3,4,5], "abc") → [3,1,5,2,4] (always same for "abc")
 */
export function seededShuffle(arr, seedStr) {
  const a = [...arr];  // Create a copy so we don't modify the original
  const rand = mulberry32(hashStringToSeed(seedStr));  // Create seeded RNG

  // Fisher-Yates shuffle algorithm
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));  // Pick random index
    [a[i], a[j]] = [a[j], a[i]];  // Swap elements
  }

  return a;
}

/**
 * WHAT IT DOES: Picks a random subset of items from an array (deterministically)
 *
 * WHY WE NEED IT: In Timed mode, we need to pick 50 random questions out of 65
 * to be scored. This selection must be the same every time for a given session.
 *
 * PARAMETERS:
 * - arr: Array to pick from
 * - count: How many items to pick
 * - seedStr: String that determines which items are picked
 *
 * RETURNS: Array containing 'count' items from arr (or all items if count > arr.length)
 *
 * EXAMPLE:
 * pickSeededSubset([1,2,3,4,5], 3, "seed123") → [3,1,5] (always same for "seed123")
 */
export function pickSeededSubset(arr, count, seedStr) {
  const shuffled = seededShuffle(arr, seedStr);  // Shuffle first
  return shuffled.slice(0, Math.min(count, shuffled.length));  // Take first N items
}

// ============================================================================
// SECURITY FUNCTION - Prevent XSS (Cross-Site Scripting) attacks
// ============================================================================

/**
 * WHAT IT DOES: Escapes HTML special characters to prevent security issues
 *
 * WHY WE NEED IT: When displaying question text or user input in the HTML,
 * we need to escape special characters (<, >, &, etc.) to prevent malicious
 * code injection (XSS attacks).
 *
 * HOW IT WORKS: Replaces dangerous HTML characters with safe HTML entities:
 * - & becomes &amp;
 * - < becomes &lt;
 * - > becomes &gt;
 * - " becomes &quot;
 * - ' becomes &#039;
 *
 * PARAMETERS:
 * - str: Any string that will be inserted into HTML
 *
 * RETURNS: Safe string with HTML characters escaped
 *
 * EXAMPLE:
 * escapeHtml("<script>alert('xss')</script>")
 *   → "&lt;script&gt;alert(&#039;xss&#039;)&lt;/script&gt;"
 *
 * SECURITY NOTE: ALWAYS use this when inserting dynamic text into HTML!
 */
export function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")    // Must be first to avoid double-escaping
    .replaceAll("<", "&lt;")     // Prevent HTML tags
    .replaceAll(">", "&gt;")     // Prevent HTML tags
    .replaceAll('"', "&quot;")   // Prevent breaking attributes
    .replaceAll("'", "&#039;");  // Prevent breaking attributes
}

/**
 * WHAT IT DOES: Returns the markup for one icon from the assets/icons.svg sprite
 *
 * WHY WE NEED IT: The UI uses one outline icon set instead of emoji. Every icon
 * is decorative (aria-hidden); the text beside it carries the meaning.
 *
 * EXAMPLE:
 * icon("flag") → '<svg class="icon" aria-hidden="true"><use href="assets/icons.svg#flag"/></svg>'
 */
export function icon(name, extraClass = "") {
  const cls = extraClass ? `icon ${extraClass}` : "icon";
  return `<svg class="${cls}" aria-hidden="true"><use href="assets/icons.svg#${name}"/></svg>`;
}

/**
 * WHAT IT DOES: Returns a URL that is safe to put in an href, or "#" if it is not
 *
 * WHY WE NEED IT: escapeHtml() stops a URL breaking out of its attribute, but a
 * "javascript:" URL would still run when clicked. Only http(s) and relative
 * paths (like assets/presentations/x.pdf) are allowed through.
 */
export function safeUrl(url) {
  const value = String(url || "").trim();
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "#"; // any other scheme
  return value || "#";
}

/**
 * WHAT IT DOES: Shows the confirmation dialog and resolves true (confirm) or false
 *
 * WHY WE NEED IT: Replaces the browser's blocking confirm() with an in-page
 * dialog that matches the app and names the consequence of the action.
 *
 * PARAMETERS:
 * - title: Short question ("Reset all progress?")
 * - body: What happens if you confirm
 * - confirmLabel: The confirm button's text, named for the action
 * - tone: "danger" paints the confirm button in the negative colour
 */
export function confirmDialog({ title, body, confirmLabel = "Confirm", tone = "default" }) {
  const dialog = document.getElementById("confirmDialog");

  // Fallback for browsers without <dialog> support
  if (!dialog || typeof dialog.showModal !== "function") {
    return Promise.resolve(window.confirm(`${title}\n\n${body}`));
  }

  document.getElementById("confirmTitle").textContent = title;
  document.getElementById("confirmBody").textContent = body;
  const okBtn = document.getElementById("confirmOkBtn");
  okBtn.textContent = confirmLabel;
  okBtn.className = tone === "danger" ? "btn btn-danger-solid" : "btn btn-primary";

  dialog.returnValue = "cancel";
  dialog.showModal();

  return new Promise((resolve) => {
    dialog.addEventListener("close", () => resolve(dialog.returnValue === "confirm"), { once: true });
  });
}

/**
 * WHAT IT DOES: Fetches a JSON data file and throws on a non-200 response
 */
export async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} loading ${url}`);
  return res.json();
}
