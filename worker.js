// StudyForge Cloudflare Worker - Proxy Claude API + GitHub API
// Secrets à configurer dans Cloudflare Dashboard :
//   ANTHROPIC_API_KEY = sk-ant-...
//   GITHUB_TOKEN = ghp_... (fine-grained PAT, repo contents read/write)
//
// Déploiement :
//   npx wrangler secret put ANTHROPIC_API_KEY
//   npx wrangler secret put GITHUB_TOKEN
//   npx wrangler deploy

const GITHUB_OWNER = 'Bencode92';
const GITHUB_REPO = 'studyforge';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS });
    }

    const url = new URL(request.url);

    try {
      // --- Route: /github/* → GitHub API proxy ---
      if (url.pathname.startsWith('/github/')) {
        return handleGitHub(request, env, url);
      }

      // --- Route: / (POST) → Claude API proxy (existing behavior) ---
      if (request.method === 'POST' && (url.pathname === '/' || url.pathname === '')) {
        return handleClaude(request, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message }, 500);
    }
  }
};

// === Claude API Proxy (unchanged) ===
async function handleClaude(request, env) {
  const body = await request.json();
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  const data = await resp.json();
  return jsonResponse(data, resp.status);
}

// === GitHub API Proxy ===
async function handleGitHub(request, env, url) {
  // /github/contents/data/index.json → api.github.com/repos/OWNER/REPO/contents/data/index.json
  // /github/ls/data/finance → list directory
  const subpath = url.pathname.replace('/github/', '');

  // READ: GET /github/contents/{path}
  if (request.method === 'GET' && subpath.startsWith('contents/')) {
    const filePath = subpath.replace('contents/', '');
    const ghUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
    const resp = await fetch(ghUrl, {
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'User-Agent': 'StudyForge-Worker',
      },
    });
    const data = await resp.json();
    return jsonResponse(data, resp.status);
  }

  // WRITE: PUT /github/contents/{path}
  if (request.method === 'PUT' && subpath.startsWith('contents/')) {
    const filePath = subpath.replace('contents/', '');
    const ghUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
    const body = await request.json();
    const resp = await fetch(ghUrl, {
      method: 'PUT',
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'Authorization': `token ${env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'StudyForge-Worker',
      },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    return jsonResponse(data, resp.status);
  }

  return jsonResponse({ error: 'Unknown GitHub route' }, 400);
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
