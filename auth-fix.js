// StudyForge - CRITICAL FIX
// Problem: ghRead never sends auth token → 60 req/h → 403 on startup
// Fix: patch ghRead + reload categories (init() already ran and failed)
// Load BEFORE patches.js

// 1. Patch ghRead to include token in headers
const _rawGhRead = ghRead;
ghRead = async function(p) {
  const headers = { 'Accept': 'application/vnd.github.v3+json' };
  if (GH.token) {
    headers['Authorization'] = 'token ' + GH.token;
  }
  const r = await fetch(
    'https://api.github.com/repos/' + GH.owner + '/' + GH.repo + '/contents/' + p,
    { headers: headers }
  );
  if (!r.ok) throw new Error(r.statusText);
  return r.json();
};

// 2. Reload categories (init() already ran with unauthed ghRead and may have got 403)
// This runs after token is restored from sessionStorage (init already did that)
(async function() {
  try {
    const idx = await ghGet('data/index.json');
    if (idx && idx.content?.categories) {
      cats = idx.content.categories;
      renderCats();
      render();
      console.log('Categories reloaded with auth (' + cats.length + ' cats)');
    }
  } catch(e) {
    // Still no token or still 403 - that's ok, user will enter token later
    console.log('Categories load deferred (no token yet):', e.message);
  }
})();

console.log('auth-fix: ghRead now uses token');
