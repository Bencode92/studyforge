// StudyForge Core - Consolidated from patches.js, quiz-fix.js, discuss-fix.js, enrich-fix.js, import-fix.js
// Order matters: each section overrides functions from the previous

// ============================================
// === SECTION 1: Core patches (cache, Claude, validation, loading)
// ============================================
// StudyForge v16.1 - Fix UX: hide old "Enrichir fiche" button, new analysis replaces it

// 0. MARKED.JS + STYLES
(function(){
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.1/marked.min.js';
  s.onload = () => { marked.setOptions({ breaks: true, gfm: true }); };
  document.head.appendChild(s);
  const style = document.createElement('style');
  style.textContent = `.md-content h1,.md-content h2,.md-content h3,.md-content h4{font-weight:700;margin:10px 0 6px;color:#e8e8f0}
.md-content h1{font-size:16px}.md-content h2{font-size:14px}.md-content h3{font-size:13px}.md-content h4{font-size:12.5px}
.md-content p{margin:4px 0;line-height:1.7}.md-content ul,.md-content ol{margin:6px 0;padding-left:20px}
.md-content li{margin:3px 0;line-height:1.6}.md-content strong{color:#e8e8f0;font-weight:700}
.md-content em{color:#9999b0;font-style:italic}
.md-content code{background:#0d0d1a;padding:2px 6px;border-radius:4px;font-size:11px;font-family:monospace;color:#7B68EE}
.md-content pre{background:#0d0d1a;padding:10px 14px;border-radius:8px;overflow-x:auto;margin:8px 0}
.md-content pre code{background:none;padding:0}.md-content blockquote{border-left:3px solid #7B68EE;padding:4px 12px;margin:8px 0;color:#9999b0}
.md-content table{border-collapse:collapse;width:100%;margin:8px 0;font-size:11px}
.md-content th,.md-content td{border:1px solid #1a1a33;padding:6px 10px;text-align:left}
.md-content th{background:#0d0d1a;font-weight:600;color:#e8e8f0}.md-content hr{border:none;border-top:1px solid #1a1a33;margin:12px 0}
.md-content a{color:#7B68EE;text-decoration:underline}
.sf-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:12px;font-size:13px;font-weight:600;font-family:Outfit,sans-serif;z-index:2000;animation:toastIn .3s ease;max-width:90%}
.sf-toast-ok{background:#34d399;color:#000}.sf-toast-err{background:#f87171;color:#fff}
@keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(20px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}`;
  document.head.appendChild(style);
})();

function renderMd(text) {
  if (!text) return '';
  if (typeof marked === 'undefined') return esc(text);
  try { const c = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, ''); return '<div class="md-content">' + marked.parse(c) + '</div>'; } catch { return esc(text); }
}

function showToast(msg, isError) {
  const t = document.createElement('div');
  t.className = 'sf-toast ' + (isError ? 'sf-toast-err' : 'sf-toast-ok');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 300); }, 3000);
}

let ficheSlug = null;
function getFichePath() { return (selCat && ficheSlug) ? 'data/' + selCat.id + '/' + ficheSlug + '.json' : null; }

const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;
const LS_CACHE_TTL = 3 * 60 * 60 * 1000; // 3h localStorage (fiches changent ~1-2x/semaine)
const LS_PREFIX = 'sf_c_';

function _lsGet(p) {
  try {
    const raw = localStorage.getItem(LS_PREFIX + p);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (Date.now() - d.ts > LS_CACHE_TTL) { localStorage.removeItem(LS_PREFIX + p); return null; }
    return d;
  } catch { return null; }
}
function _lsSet(p, data, sha) {
  try { localStorage.setItem(LS_PREFIX + p, JSON.stringify({ data, sha, ts: Date.now() })); } catch {}
}
function _lsDel(p) {
  try { localStorage.removeItem(LS_PREFIX + p); } catch {}
}
// Invalidate cache if index.json changed on another device
async function _checkCacheValidity() {
  try {
    const lsIdx = _lsGet('data/index.json');
    if (!lsIdx) return; // no cache, nothing to invalidate
    const d = await _origGhRead('data/index.json');
    if (d.sha !== lsIdx.sha) {
      console.log('Cache invalidated: index.json sha changed');
      // Clear all localStorage cache
      var keys = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) keys.push(k);
      }
      keys.forEach(function(k) { localStorage.removeItem(k); });
      _cache.clear();
    }
  } catch (e) { /* network error, keep cache */ }
}
// Force refresh function (exposed globally)
function forceRefreshCache() {
  var keys = [];
  for (var i = 0; i < localStorage.length; i++) {
    var k = localStorage.key(i);
    if (k && k.startsWith(LS_PREFIX)) keys.push(k);
  }
  keys.forEach(function(k) { localStorage.removeItem(k); });
  _cache.clear();
  showToast('Cache vide ! Rechargement...');
  setTimeout(function() { location.reload(); }, 500);
}
window.forceRefreshCache = forceRefreshCache;

const _origGhRead = ghRead;
ghGet = async function(p) {
  // 1. In-memory cache
  const cached = _cache.get(p);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return { content: cached.data, sha: cached.sha };
  // 2. localStorage cache (fast startup)
  const lsCached = _lsGet(p);
  if (lsCached) {
    _cache.set(p, { data: lsCached.data, sha: lsCached.sha, ts: Date.now() });
    return { content: lsCached.data, sha: lsCached.sha };
  }
  // 3. Network fetch
  try {
    const d = await _origGhRead(p);
    const b = atob(d.content);
    const bytes = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    _cache.set(p, { data: parsed, sha: d.sha, ts: Date.now() });
    _lsSet(p, parsed, d.sha);
    return { content: parsed, sha: d.sha };
  } catch { return null; }
};

const _origGhPut = ghPut;
ghPut = async function(path, content, msg, sha) {
  if (path.endsWith('.json') && path.includes('/') && !path.endsWith('_meta.json') && !path.endsWith('index.json')) {
    const data = typeof content === 'string' ? JSON.parse(content) : content;
    const errors = validateFicheJSON(data);
    if (errors.length > 0) { console.error('BLOCKED ' + path + ':', errors); throw new Error('Validation: ' + errors.join(', ')); }
  }
  _cache.delete(path);
  _lsDel(path);
  const dir = path.substring(0, path.lastIndexOf('/'));
  _cache.forEach((v, k) => { if (k.startsWith(dir)) { _cache.delete(k); _lsDel(k); } });
  return _origGhPut(path, content, msg, sha);
};

const SONNET = 'claude-sonnet-4-20250514';
const HAIKU = 'claude-haiku-4-5-20251001';
callClaude = async function(sys, msgs, model, maxTok) {
  const body = { model: model || SONNET, max_tokens: maxTok || 4000, system: sys };
  body.messages = Array.isArray(msgs) ? msgs : [{ role: 'user', content: msgs }];
  const r = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'API error');
  return d.content?.[0]?.text || '';
};

function validateFicheJSON(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return ['Pas un objet JSON'];
  if (!data.metadata) errors.push('metadata manquant');
  if (!data.base) errors.push('base manquant');
  if (data.metadata) { if (!data.metadata.title) errors.push('metadata.title manquant'); if (!data.metadata.category) errors.push('metadata.category manquant'); if (data.metadata.version !== undefined) data.metadata.version = parseInt(data.metadata.version) || 1; }
  if (data.base) { if (!Array.isArray(data.base.sections)) errors.push('base.sections pas un array'); else if (data.base.sections.length === 0) errors.push('base.sections vide'); else data.base.sections.forEach((s, i) => { if (!s.title) errors.push('section['+i+'].title manquant'); if (!Array.isArray(s.concepts)) s.concepts=[]; if (!Array.isArray(s.keyPoints)) s.keyPoints=[]; if (!Array.isArray(s.warnings)) s.warnings=[]; if (!Array.isArray(s.examples)) s.examples=[]; }); }
  if (!Array.isArray(data.enrichments)) data.enrichments = [];
  if (!data.quiz) data.quiz = { totalAttempts: 0, history: [], weakPoints: [] };
  if (!Array.isArray(data.discussions)) data.discussions = [];
  return errors;
}

function smartTruncateFiche(ficheJSON, maxLen) {
  if (ficheJSON.length <= maxLen) return ficheJSON;
  try {
    const f = JSON.parse(ficheJSON);
    if (f.base?.sections) f.base.sections.forEach(s => { if (s.content && s.content.length > 500) s.content = s.content.slice(0, 400) + '...[tronque]'; });
    let r = JSON.stringify(f); if (r.length <= maxLen) return r;
    if (f.enrichments?.length > 3) { f.enrichments = f.enrichments.slice(-3); r = JSON.stringify(f); } if (r.length <= maxLen) return r;
    if (f.base?.sections) f.base.sections.forEach(s => { s.examples = []; s.warnings = s.warnings?.slice(0, 1) || []; });
    r = JSON.stringify(f); if (r.length <= maxLen) return r;
    if (f.base?.sections) f.base.sections.forEach(s => { s.content = '[voir fiche complete]'; });
    return JSON.stringify(f);
  } catch { return ficheJSON.slice(0, maxLen); }
}

function buildQuizContext(fiche) {
  const sections = fiche.base?.sections || [];
  const wp = fiche.quiz?.weakPoints || [];
  return sections.map(s => {
    let summary = '## ' + s.title;
    const hasWeak = wp.some(w => s.keyPoints?.some(kp => w.includes(kp?.slice(0, 20))) || s.title.toLowerCase().includes(w.slice(0, 15).toLowerCase()));
    if (hasWeak) summary += ' [WEAK]';
    summary += '\n';
    if (s.content) summary += s.content.slice(0, 300) + '\n';
    if (s.concepts?.length) summary += 'Concepts: ' + s.concepts.map(c => c.term + ' = ' + (c.definition || '').slice(0, 80)).join(' | ') + '\n';
    if (s.keyPoints?.length) summary += 'Points cles: ' + s.keyPoints.join(' | ') + '\n';
    if (s.warnings?.length) summary += 'Pieges: ' + s.warnings.join(' | ') + '\n';
    if (s.examples?.length) summary += 'Exemples: ' + s.examples.join(' | ') + '\n';
    return summary;
  }).join('\n');
}

let qCount = 10, qLevel = 'modere', qAnalysis = null, qSuggestions = null;

const overlay = document.createElement('div');
overlay.id = 'loading-overlay';
overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(6,6,16,0.5);display:none;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:16px;backdrop-filter:blur(2px)';
overlay.innerHTML = '<div style="width:40px;height:40px;border:3px solid #7B68EE;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div><p id="loading-text" style="color:#a29bfe;font-size:15px;font-weight:600;font-family:Outfit,sans-serif">Chargement...</p><p style="color:#8888a8;font-size:11px;font-family:Outfit,sans-serif">Powered by Claude AI</p>';
document.body.appendChild(overlay);

// Progress bar en haut de page (non bloquante)
const _progBar = document.createElement('div');
_progBar.id = 'sf-progress';
_progBar.style.cssText = 'position:fixed;top:0;left:0;width:0;height:3px;background:linear-gradient(90deg,#7B68EE,#60a5fa);z-index:1001;transition:width .3s ease;display:none';
document.body.appendChild(_progBar);
const _progStyle = document.createElement('style');
_progStyle.textContent = '@keyframes sf-prog{0%{width:0}50%{width:70%}100%{width:95%}}.sf-prog-anim{animation:sf-prog 8s ease-out forwards;display:block!important}';
document.head.appendChild(_progStyle);

// Skeleton shimmer CSS
const _skelStyle = document.createElement('style');
_skelStyle.textContent = '@keyframes sf-shimmer{0%{background-position:-200px 0}100%{background-position:200px 0}}.sf-skel{background:linear-gradient(90deg,var(--card) 25%,#1a1a33 50%,var(--card) 75%);background-size:400px 100%;animation:sf-shimmer 1.5s infinite;border-radius:10px}';
document.head.appendChild(_skelStyle);

function showLoading(t) {
  document.getElementById('loading-text').textContent = t || 'Chargement...';
  overlay.style.display = 'flex';
  _progBar.className = 'sf-prog-anim';
}
function hideLoading() {
  overlay.style.display = 'none';
  _progBar.style.width = '100%';
  _progBar.className = '';
  setTimeout(function() { _progBar.style.display = 'none'; _progBar.style.width = '0'; }, 300);
}
// Skeleton helper for dashboard
function showDashSkeleton(container) {
  var h = '<div style="max-width:900px;margin:0 auto">';
  h += '<div style="text-align:center;margin-bottom:28px"><div class="sf-skel" style="width:48px;height:48px;border-radius:12px;margin:0 auto 12px"></div><div class="sf-skel" style="width:160px;height:24px;margin:0 auto 8px"></div><div class="sf-skel" style="width:120px;height:14px;margin:0 auto"></div></div>';
  h += '<div style="display:flex;gap:10px;margin-bottom:24px;justify-content:center">';
  for (var i = 0; i < 4; i++) h += '<div class="sf-skel" style="width:100px;height:60px"></div>';
  h += '</div>';
  h += '<div class="sf-skel" style="width:200px;height:18px;margin-bottom:16px"></div>';
  for (var j = 0; j < 4; j++) h += '<div class="sf-skel" style="width:100%;height:64px;margin-bottom:8px"></div>';
  h += '</div>';
  container.innerHTML = h;
}

function updateWeakPoints(ficheData, qResults, type) {
  if (!ficheData.quiz) ficheData.quiz = { totalAttempts: 0, history: [], weakPoints: [] };
  if (!ficheData.quiz._wpSuccess) ficheData.quiz._wpSuccess = {};
  if (type === 'qcm') { qResults.forEach(r => { const q = r.question; if (r.ok) { ficheData.quiz._wpSuccess[q] = (ficheData.quiz._wpSuccess[q] || 0) + 1; if (ficheData.quiz._wpSuccess[q] >= 2) { ficheData.quiz.weakPoints = ficheData.quiz.weakPoints.filter(wp => wp !== q); delete ficheData.quiz._wpSuccess[q]; } } else { ficheData.quiz._wpSuccess[q] = 0; if (!ficheData.quiz.weakPoints.includes(q)) ficheData.quiz.weakPoints.push(q); } }); }
}

async function saveDiscussion(status) {
  if (!fiche || !selCat || !hasToken() || chatMsgs.length < 2 || !ficheSlug) return;
  const u = JSON.parse(JSON.stringify(fiche));
  if (!u.discussions) u.discussions = [];
  u.discussions.push({ id: 'disc-' + Date.now(), date: new Date().toISOString().split('T')[0], status: status || 'open', messageCount: chatMsgs.length, preview: chatMsgs.slice(0, 2).map(m => m.content.slice(0, 50)).join(' | '), messages: chatMsgs.map(m => ({ role: m.role, content: m.content.slice(0, 2000) })) });
  if (u.discussions.length > 5) u.discussions = u.discussions.slice(-5);
  try { const ex = await ghGet(getFichePath()); await ghPut(getFichePath(), u, 'Save discussion', ex?.sha); fiche = u; } catch (e) { console.error('Disc save:', e); }
}
window.saveDiscussion = saveDiscussion;

function loadPreviousDiscussion() {
  if (!fiche?.discussions?.length) return;
  const last = fiche.discussions[fiche.discussions.length - 1];
  if (last.status === 'open' && last.messages?.length) { chatMsgs = last.messages.map(m => ({ role: m.role, content: m.content })); showToast('Discussion restauree (' + chatMsgs.length + ' msg)'); }
}

genQuiz = async function() {
  if (!fiche) return;
  showLoading('Generation de ' + qCount + ' questions (' + qLevel + ')...');
  qRes = null; qAns = {}; qFlip = {}; qAnalysis = null; qSuggestions = null;
  const ctx = buildQuizContext(fiche);
  const en = (fiche.enrichments || []).map(e => (e.addedPoints || []).join(', ')).join(' | ');
  const wp = (fiche.quiz?.weakPoints || []).slice(0, 10).join(', ');
  const maxTok = qCount <= 10 ? 4000 : qCount <= 15 ? 6000 : 8000;
  const levels = { basique: 'BASIQUE: memorisation, definitions.', modere: 'MODERE: application, comprehension.', expert: 'EXPERT: cas pratiques complexes, pieges, calculs.' };
  const pr = {
    qcm: 'Genere exactement ' + qCount + ' QCM. Niveau ' + levels[qLevel] + (wp ? ' Points faibles (insiste): ' + wp : '') + '. REGLE: correct DOIT correspondre a l\'explication. JSON array sans backticks: [{"id":1,"question":"","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":""}]',
    open: 'Genere exactement ' + qCount + ' questions ouvertes. Niveau ' + levels[qLevel] + '. JSON array sans backticks: [{"id":1,"question":"","expectedPoints":["","",""],"difficulty":"' + qLevel + '","hint":""}]',
    flashcard: 'Genere exactement ' + qCount + ' flashcards. Niveau ' + levels[qLevel] + '. JSON array sans backticks: [{"id":1,"front":"","back":""}]'
  };
  try {
    const r = await callClaude('Quiz pedagogique patrimoine/fiscalite. JSON UNIQUEMENT, sans backticks. ' + qCount + ' elements. QCM: correct = bonne reponse coherente avec explanation.', pr[qType] + '\n\nCONTENU:\n' + ctx.slice(0, 8000) + (en ? '\nENRICHISSEMENTS: ' + en.slice(0, 1000) : ''), HAIKU, maxTok);
    const p = parseJ(r);
    if (p && Array.isArray(p)) { quiz = p; showToast(p.length + ' questions !'); }
    else { console.error('Quiz parse:', r.slice(0, 500)); showToast('Erreur. Reessaie.', true); }
  } catch (e) { showToast('Erreur: ' + e.message, true); }
  hideLoading(); render();
};

correctQuiz = async function() {
  if (!quiz) return; showLoading('Correction...');
  qAnalysis = null; qSuggestions = null;
  if (qType === 'qcm') { qRes = quiz.map(q => ({ ...q, ua: qAns[q.id], ok: qAns[q.id] === q.correct })); hideLoading(); render(); return; }
  const txt = quiz.map(q => 'Q: ' + q.question + '\nR: ' + (qAns[q.id] || '(vide)')).join('\n\n');
  try { const r = await callClaude('Corrige. JSON sans backticks: [{"id":1,"score":0,"feedback":"","missingPoints":[""],"suggestion":""}]', txt + '\nAttendus: ' + JSON.stringify(quiz.map(q => ({ id: q.id, pts: q.expectedPoints }))), HAIKU); const p = parseJ(r); if (p) qRes = p; } catch (e) { setStatus('Erreur: ' + e.message); }
  hideLoading(); render();
};

async function analyzeQuizErrors() {
  if (!qRes || !fiche) return;
  showLoading('Analyse de tes erreurs...');
  let errorsText = '';
  if (qType === 'qcm') {
    const wrong = qRes.filter(r => !r.ok);
    if (!wrong.length) { qAnalysis = 'Bravo, aucune erreur !'; hideLoading(); const c = $('content'); if (c) delete c.dataset.analysisPatched; render(); return; }
    errorsText = wrong.map(w => 'Q: ' + w.question + '\nDonne: ' + ((w.options||[]).find(o => o.charAt(0) === w.ua)||'?') + '\nCorrect: ' + ((w.options||[]).find(o => o.charAt(0) === w.correct)||'?') + '\nExplication: ' + (w.explanation||'')).join('\n\n');
  } else {
    const weak = qRes.filter(r => r.score < 7);
    if (!weak.length) { qAnalysis = 'Tres bon resultat !'; hideLoading(); const c = $('content'); if (c) delete c.dataset.analysisPatched; render(); return; }
    errorsText = weak.map(w => { const q = quiz.find(x => x.id === w.id); return 'Q: ' + (q?.question||'') + '\nScore: ' + w.score + '/10\nManque: ' + (w.missingPoints||[]).join(', '); }).join('\n\n');
  }
  try { qAnalysis = await callClaude('Tuteur expert. Analyse chaque erreur: pourquoi, explication legale, astuce memo. Markdown. Francais.', 'ERREURS:\n' + errorsText, HAIKU, 3000); } catch (e) { qAnalysis = 'Erreur: ' + e.message; }
  try {
    const ctx = JSON.stringify((fiche.base?.sections||[]).map(s => ({ title: s.title, keyPoints: s.keyPoints, warnings: s.warnings })));
    const r = await callClaude('Propose ameliorations fiche. JSON sans backticks: {"improvements":[{"type":"warning|example|concept|keyPoint","section":"titre","content":"texte","reason":"pourquoi"}],"summary":"resume"}', 'ERREURS:\n' + errorsText + '\nFICHE:\n' + ctx, HAIKU, 2000);
    qSuggestions = parseJ(r);
  } catch (e) { console.error('Suggestions:', e); }
  hideLoading();
  const content = $('content'); if (content) delete content.dataset.analysisPatched;
  render();
  setTimeout(() => { const c = $('content'); if (c) c.scrollTop = c.scrollHeight; }, 100);
}
window.analyzeQuizErrors = analyzeQuizErrors;

async function applyQuizImprovements() {
  if (!qSuggestions?.improvements?.length || !fiche || !selCat || !ficheSlug) return;
  requireToken(async function() {
    showLoading('Amelioration...');
    const u = JSON.parse(JSON.stringify(fiche));
    if (!u.enrichments) u.enrichments = []; if (!u.quiz) u.quiz = { totalAttempts: 0, history: [], weakPoints: [] };
    const applied = [];
    qSuggestions.improvements.forEach(imp => {
      const sec = u.base?.sections?.find(s => s.title.toLowerCase().includes((imp.section||'').toLowerCase().slice(0,15)));
      const t = sec || u.base?.sections?.[0]; if (!t) return;
      if (imp.type==='warning'&&imp.content) { t.warnings.push(imp.content); applied.push(imp.content); }
      else if (imp.type==='example'&&imp.content) { t.examples.push(imp.content); applied.push(imp.content); }
      else if (imp.type==='keyPoint'&&imp.content) { t.keyPoints.push(imp.content); applied.push(imp.content); }
      else if (imp.type==='concept'&&imp.content) { t.concepts.push({ term: imp.content.split(':')[0]||imp.content, definition: imp.content, ref: '' }); applied.push(imp.content); }
    });
    if (!applied.length) { showToast('Rien a appliquer', true); hideLoading(); return; }
    u.enrichments.push({ id: 'enr-qa-' + Date.now(), date: new Date().toISOString().split('T')[0], source: { type: 'quiz-analysis' }, trigger: 'quiz', summary: qSuggestions.summary || applied.length + ' ameliorations', addedPoints: applied });
    u.quiz.totalAttempts++; u.quiz.lastDate = new Date().toISOString().split('T')[0];
    if (qType === 'qcm' && qRes) { u.quiz.history.push({ date: u.quiz.lastDate, type: 'qcm', score: qRes.filter(r => r.ok).length + '/' + qRes.length, level: qLevel }); updateWeakPoints(u, qRes, 'qcm'); }
    u.metadata.version = (u.metadata.version || 1) + 1;
    try { const ex = await ghGet(getFichePath()); await ghPut(getFichePath(), u, 'Quiz v' + u.metadata.version, ex?.sha); fiche = u; showToast('Fiche v' + u.metadata.version + ' amelioree !'); } catch (e) { showToast('Erreur: ' + e.message, true); }
    hideLoading(); render();
  });
}
window.applyQuizImprovements = applyQuizImprovements;

sendMsg = async function() {
  const msg = $('chat-input')?.value?.trim(); if (!msg || !fiche) return;
  $('chat-input').value = ''; chatMsgs.push({ role: 'user', content: msg }); render();
  showLoading('Reflexion...');
  const ficheJSON = smartTruncateFiche(JSON.stringify(fiche), 12000);
  const sys = `Tuteur expert patrimoine/fiscalite/finance. Fiche:\n${ficheJSON}\n\nDetaille, pedagogique, exemples, references legales, challenge. Markdown. Francais. Pas de JSON.`;
  try { const r = await callClaude(sys, chatMsgs.map(m => ({ role: m.role, content: m.content })), SONNET, 4000); chatMsgs.push({ role: 'assistant', content: r }); } catch (e) { chatMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message }); }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

async function _doApplyChanges() {
  if (!fiche || !selCat || !ficheSlug) return;
  if (chatMsgs.length < 1) { showToast('Discute d\'abord', true); return; }
  showLoading('Application...');
  const ficheJSON = smartTruncateFiche(JSON.stringify(fiche), 15000);
  const disc = chatMsgs.map(m => (m.role === 'user' ? 'USER' : 'EXPERT') + ': ' + m.content).join('\n\n').slice(0, 8000);
  try {
    const r = await callClaude('Expert. APPLIQUE modifications. JSON sans backticks. metadata,base.sections(non vide),enrichments,quiz. Accents. CONSERVE existants. Incremente version.', 'FICHE:\n' + ficheJSON + '\n\nDISCUSSION:\n' + disc, SONNET, 8000);
    const p = parseJ(r);
    if (!p) { showToast('JSON invalide - F12', true); hideLoading(); return; }
    const err = validateFicheJSON(p); if (err.length) { showToast('Validation: ' + err.join(', '), true); hideLoading(); return; }
    p.metadata.version = (fiche.metadata?.version || 1) + 1;
    const ex = await ghGet(getFichePath()); await ghPut(getFichePath(), p, 'Discuss v' + p.metadata.version, ex?.sha);
    fiche = p; await saveDiscussion('applied');
    showToast('Fiche v' + p.metadata.version + ' sauvegardee !'); currentView = 'fiche';
  } catch (e) { showToast('Erreur: ' + e.message, true); }
  hideLoading(); render();
}
function applyDiscussionChanges() { requireToken(() => _doApplyChanges()); }
window.applyDiscussionChanges = applyDiscussionChanges;

doAnalysis = async function(text) {
  showLoading('Analyse IA...');
  impStep = 'discuss'; impMsgs = [];
  const catList = cats.map(c => c.id + ' (' + c.name + ')').join(', ');
  try {
    render();
    const r = await callClaude('Expert patrimoine/finance/fiscalite. Analyse: sujet, TITRE, CATEGORIE parmi ' + catList + ' (ou NOUVELLE:nom). Points forts/erreurs/manques. Ameliorations. 2-3 questions. Markdown. Francais. Fin: JSON {"suggestedTitle":"","suggestedCategory":"","analysis":""}', 'Contenu:\n\n' + text.slice(0, 14000), SONNET);
    let display = r, meta = null;
    const jm = r.match(/\{"suggestedTitle"[\s\S]*?\}/); if (jm) { meta = parseJ(jm[0]); display = r.replace(jm[0], '').trim(); }
    impMsgs.push({ role: 'assistant', content: display, meta: meta });
  } catch (e) { impMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message }); }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

const _origSave = saveImportFiche;
saveImportFiche = async function() { if (!hasToken()) { requireToken(saveImportFiche); return; } showLoading('Structuration...'); await _origSave(); hideLoading(); showToast('Fiche creee !'); };
const _origEnrich = enrichDoc;
enrichDoc = async function() { if (!hasToken()) { requireToken(enrichDoc); return; } showLoading('Analyse...'); await _origEnrich(); hideLoading(); };

const _origLoadFiche = loadFiche;
loadFiche = async function(id) { ficheSlug = id; await _origLoadFiche(id); loadPreviousDiscussion(); };

// RENDER
const _origRender = render;
render = function() {
  _origRender();
  const content = $('content'); if (!content) return;

  // Markdown in AI messages
  if (typeof marked !== 'undefined') {
    content.querySelectorAll('.msg-ai').forEach(el => {
      if (el.dataset.mdRendered) return;
      el.dataset.mdRendered = 'true';
      const raw = el.textContent;
      if (raw) { el.style.whiteSpace = 'normal'; el.innerHTML = renderMd(raw); }
    });
  }

  if (currentView === 'quiz' && fiche) {
    // Quiz controls
    const genBtn = content.querySelector('[onclick*="genQuiz"]');
    if (genBtn) {
      const row = genBtn.parentElement;
      if (row && !row.dataset.patched) {
        row.dataset.patched = 'true'; genBtn.remove();
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap';
        d.innerHTML = '<select id="q-count" onchange="qCount=+this.value" style="padding:6px 10px;border-radius:8px;background:#111122;border:1px solid #1a1a33;color:#e8e8f0;font-size:12px;font-family:inherit">' +
          [5,10,15,20,25].map(n => '<option value="'+n+'" '+(qCount===n?'selected':'')+'>'+n+' Q</option>').join('') +
          '</select><select id="q-level" onchange="qLevel=this.value" style="padding:6px 10px;border-radius:8px;background:#111122;border:1px solid #1a1a33;color:#e8e8f0;font-size:12px;font-family:inherit">' +
          '<option value="basique" '+(qLevel==='basique'?'selected':'')+'>Basique</option><option value="modere" '+(qLevel==='modere'?'selected':'')+'>Modere</option><option value="expert" '+(qLevel==='expert'?'selected':'')+'>Expert</option>' +
          '</select><button class="btn btn-pri" onclick="genQuiz()">\u{1F916} Generer</button>';
        row.appendChild(d);
      }
    }

    // HIDE old "Enrichir fiche" button - replaced by new analysis flow
    if (qRes && qType !== 'flashcard') {
      const oldEnrichBtn = content.querySelector('[onclick*="enrichQuiz"]');
      if (oldEnrichBtn) {
        // Replace "Score | Enrichir fiche | Nouveau" with "Score | Nouveau"
        const btnRow = oldEnrichBtn.parentElement;
        if (btnRow && !btnRow.dataset.cleaned) {
          btnRow.dataset.cleaned = 'true';
          oldEnrichBtn.remove(); // Remove "Enrichir fiche"
        }
      }
    }

    // Error analysis section (replaces old enrichment)
    if (qRes && qType !== 'flashcard' && !content.dataset.analysisPatched) {
      content.dataset.analysisPatched = 'true';
      const container = content.querySelector('[style*="max-width:780px"]'); if (!container) return;
      const hasErr = qType === 'qcm' ? qRes.some(r => !r.ok) : qRes.some(r => r.score < 7);
      const aDiv = document.createElement('div'); aDiv.style.cssText = 'margin-top:14px';
      if (!qAnalysis && hasErr) {
        aDiv.innerHTML = '<div style="background:#111122;border:1px solid #f87171;border-radius:14px;padding:20px;text-align:center"><p style="font-size:14px;font-weight:600;color:#f87171;margin-bottom:8px">\u{1F50D} Des erreurs detectees</p><p style="font-size:12px;color:#9999b0;margin-bottom:14px">L\'IA analyse tes erreurs et propose des ameliorations a la fiche</p><button class="btn" onclick="analyzeQuizErrors()" style="background:#f87171;color:#fff;padding:12px 24px;font-size:14px">\u{1F9E0} Analyser mes erreurs et ameliorer la fiche</button></div>';
      } else if (!qAnalysis && !hasErr) {
        aDiv.innerHTML = '<div style="background:#111122;border:1px solid #34d399;border-radius:14px;padding:20px;text-align:center"><p style="font-size:14px;font-weight:600;color:#34d399">\u2705 Parfait ! Aucune erreur.</p></div>';
      } else if (qAnalysis) {
        let h = '<div style="background:#111122;border:1px solid #7B68EE;border-radius:14px;padding:20px;margin-bottom:14px"><h4 style="font-size:14px;color:#7B68EE;margin-bottom:10px">\u{1F9E0} Analyse de tes erreurs</h4><div style="font-size:12.5px;color:#9999b0;line-height:1.7">' + renderMd(qAnalysis) + '</div></div>';
        if (qSuggestions?.improvements?.length) {
          h += '<div style="background:#111122;border:1px solid #fbbf24;border-radius:14px;padding:20px"><h4 style="font-size:14px;color:#fbbf24;margin-bottom:10px">\u{1F4DD} Ameliorations proposees pour la fiche</h4>';
          qSuggestions.improvements.forEach(imp => {
            h += '<div style="padding:8px 0;border-bottom:1px solid #1a1a33;font-size:12px"><span style="color:#fbbf24">' + (imp.type||'').toUpperCase() + '</span>' + (imp.section ? ' <span style="color:#6b6b88">(' + esc(imp.section) + ')</span>' : '') + '<p style="color:#e8e8f0;margin-top:4px">' + esc(imp.content) + '</p></div>';
          });
          h += '<button class="btn btn-grn" onclick="applyQuizImprovements()" style="width:100%;padding:14px;font-size:14px;margin-top:14px">\u2713 Appliquer ces ameliorations a la fiche</button></div>';
        }
        aDiv.innerHTML = h;
      }
      container.appendChild(aDiv);
    }
  }

  // DISCUSSION
  if (currentView === 'discuss' && fiche) {
    const chatInput = content.querySelector('[id="chat-input"]');
    if (chatInput) {
      const inputRow = chatInput.parentElement;
      if (inputRow && !inputRow.dataset.patched) {
        inputRow.dataset.patched = 'true';
        const aRow = document.createElement('div');
        aRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-shrink:0';
        aRow.innerHTML = '<button class="btn btn-grn" onclick="applyDiscussionChanges()" style="flex:1;padding:12px;font-size:13px"' + (chatMsgs.length < 1 ? ' disabled' : '') + '>\u2713 Appliquer les modifications</button>' +
          '<button class="btn btn-sec" onclick="saveDiscussion(\'open\');showToast(\'Discussion sauvegardee\')" style="padding:12px;font-size:12px"' + (chatMsgs.length < 2 ? ' disabled' : '') + '>\u{1F4BE} Sauvegarder</button>' +
          '<span style="display:flex;align-items:center;padding:0 4px;font-size:10px;color:#6b6b88">v' + (fiche.metadata?.version || 1) + '</span>';
        inputRow.parentElement.insertBefore(aRow, inputRow.nextSibling);
      }
    }
  }
};

console.log('StudyForge v16.1: Hide old Enrichir button, new analysis is the enrichment');

// ============================================
// === SECTION 2: Quiz generation (smart context, balanced mix)
// ============================================
// StudyForge v14.3 - Fix flashcards: terms/definitions, NOT questions
// + balanced mix theory/practice for QCM and open questions

genQuiz = async function() {
  if (!fiche) return;
  showLoading('Generation de ' + qCount + (qType === 'flashcard' ? ' flashcards' : ' questions') + ' (' + qLevel + ')...');
  qRes = null; qAns = {}; qFlip = {}; qAnalysis = null; qSuggestions = null;

  // SMART CONTEXT: summarize sections instead of raw JSON
  const sections = fiche.base?.sections || [];
  const ctx = sections.map(s => {
    let summary = '## ' + s.title + '\n';
    if (s.content) summary += s.content.slice(0, 300) + '\n';
    if (s.concepts?.length) summary += 'Concepts: ' + s.concepts.map(c => c.term + ' = ' + (c.definition || '').slice(0, 80)).join(' | ') + '\n';
    if (s.keyPoints?.length) summary += 'Points cles: ' + s.keyPoints.join(' | ') + '\n';
    if (s.warnings?.length) summary += 'Pieges: ' + s.warnings.join(' | ') + '\n';
    if (s.examples?.length) summary += 'Exemples: ' + s.examples.join(' | ') + '\n';
    return summary;
  }).join('\n');

  const en = (fiche.enrichments || []).map(e => (e.addedPoints || []).join(', ')).join(' | ');
  const wp = (fiche.quiz?.weakPoints || []).slice(0, 10).join(', ');

  // MIX per level for QCM and open questions
  const levels = {
    basique: 'BASIQUE - 70% definitions/memorisation, 30% application simple.',
    modere: 'MODERE - 40% definitions/theorie, 40% application, 20% pieges.',
    expert: 'EXPERT - 30% theorie avancee (definitions, articles de loi, exceptions, distinctions), 40% cas pratiques avec calculs, 30% pieges. NE GENERE PAS uniquement des calculs.'
  };

  // FLASHCARD levels are different - about depth, not question types
  const flashLevels = {
    basique: 'BASIQUE - Termes fondamentaux, definitions simples, seuils et plafonds de base, acronymes.',
    modere: 'MODERE - Termes precis avec references legales, distinctions entre concepts proches, seuils avec conditions, mecanismes fiscaux.',
    expert: 'EXPERT - Distinctions subtiles entre regimes, exceptions legales, articulations entre dispositifs, seuils avec cas particuliers, pieges courants formules comme "A ne pas confondre avec...".'
  };

  const maxTok = qCount <= 10 ? 4000 : qCount <= 15 ? 6000 : 8000;

  const mixRule = 'REGLE: varie les types. Alterne definitions ("Qu\'est-ce que X?"), applications ("Calculez..."), pieges ("Vrai ou faux"). PAS uniquement des calculs.';

  const pr = {
    qcm: 'Genere exactement ' + qCount + ' QCM. ' + levels[qLevel] + ' ' + mixRule + (wp ? ' Points faibles: ' + wp : '') + '. JSON array sans backticks: [{"id":1,"question":"","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":""}]',

    open: 'Genere exactement ' + qCount + ' questions ouvertes. ' + levels[qLevel] + ' ' + mixRule + '. JSON array sans backticks: [{"id":1,"question":"","expectedPoints":["","",""],"difficulty":"' + qLevel + '","hint":""}]',

    flashcard: 'Genere exactement ' + qCount + ' FLASHCARDS de revision. ' + flashLevels[qLevel] + '\n\n' +
      'REGLE FONDAMENTALE: une flashcard N\'EST PAS une question. C\'est un TERME au recto et sa DEFINITION au verso.\n\n' +
      'FORMAT OBLIGATOIRE pour chaque flashcard:\n' +
      '- "front" = un TERME, un CONCEPT, un ACRONYME, un SEUIL, ou une NOTION courte (5-15 mots max)\n' +
      '  Exemples de bons rectos: "PER individuel", "Plafond PER salarie", "Quasi-usufruit", "Article 150-0 B ter du CGI", "Difference PER / PERP", "Sortie en capital du PER"\n' +
      '  Exemples de MAUVAIS rectos: "Calculez le plafond...", "Un cadre gagne 80 000 EUR...", "Quel est l\'impact fiscal..."\n' +
      '- "back" = la DEFINITION precise, le MONTANT, l\'EXPLICATION ou la REGLE (1-3 phrases)\n' +
      '  Inclure la reference legale (article CGI, Code civil) quand applicable.\n\n' +
      'VARIETE: inclure un mix de (1) definitions de termes, (2) seuils et plafonds chiffres, (3) distinctions entre concepts proches, (4) references legales, (5) regles fiscales cles.\n\n' +
      'JSON array sans backticks: [{"id":1,"front":"","back":""}]'
  };

  // Different system prompts for flashcards vs questions
  const sysPr = qType === 'flashcard'
    ? 'Tu crees des flashcards de revision sur le patrimoine et la fiscalite francaise. Une flashcard = un TERME au recto, sa DEFINITION au verso. PAS de questions, PAS de cas pratiques, PAS de "Calculez...". JSON valide uniquement, sans backticks. EXACTEMENT ' + qCount + ' elements.'
    : 'Tu generes des quiz pedagogiques sur le patrimoine et la fiscalite francaise. JSON valide uniquement, sans backticks. EXACTEMENT ' + qCount + ' elements. Varie les types: definitions, cas pratiques, pieges.';

  try {
    const r = await callClaude(
      sysPr,
      pr[qType] + '\n\nCONTENU DE LA FICHE:\n' + ctx.slice(0, 8000) + (en ? '\n\nENRICHISSEMENTS: ' + en.slice(0, 1000) : ''),
      HAIKU,
      maxTok
    );
    const p = parseJ(r);
    if (p && Array.isArray(p)) {
      quiz = p;
      showToast(p.length + (qType === 'flashcard' ? ' flashcards' : ' questions') + ' generees !');
    } else {
      console.error('Quiz parseJ failed. Raw (500):', r.slice(0, 500));
      showToast('Erreur: reponse IA invalide. Reessaie.', true);
    }
  } catch (e) {
    console.error('Quiz gen error:', e);
    showToast('Erreur: ' + e.message, true);
  }
  hideLoading(); render();
};

console.log('v14.3: Flashcards = terms/definitions, not questions');

// ============================================
// === SECTION 3: Discussion (2-step extract+apply)
// ============================================
// StudyForge v16.2 - Fix: "Appliquer les modifications" for large fiches
// Problem: Sonnet had to reproduce the ENTIRE fiche JSON (14KB+) → output truncated → parseJ fails
// Fix: 2-step approach - Step 1: IA lists changes as operations, Step 2: apply locally
// Same pattern as quiz improvements - much more reliable

async function _doApplyChanges() {
  if (!fiche || !selCat || !ficheSlug) return;
  if (chatMsgs.length < 1) { showToast('Discute d\'abord', true); return; }

  showLoading('Extraction des modifications...');

  // Summarize the discussion - only send last 6000 chars to leave room
  const disc = chatMsgs
    .map(m => (m.role === 'user' ? 'USER' : 'EXPERT') + ': ' + m.content)
    .join('\n\n');
  const discTrunc = disc.length > 6000 
    ? disc.slice(0, 3000) + '\n\n[...]\n\n' + disc.slice(-3000) 
    : disc;

  // Send fiche structure (titles + key points only, not full content)
  const ficheStructure = (fiche.base?.sections || []).map((s, i) => 
    'Section ' + i + ': "' + s.title + '" (' + (s.keyPoints?.length || 0) + ' keyPoints, ' + 
    (s.warnings?.length || 0) + ' warnings, ' + (s.concepts?.length || 0) + ' concepts, ' + 
    (s.examples?.length || 0) + ' examples)'
  ).join('\n');

  // STEP 1: Ask IA to list the changes as structured operations
  try {
    const sysSt1 = 'Tu es un expert pedagogique. L\'utilisateur a discute avec un tuteur IA. ' +
      'Analyse la discussion et LISTE toutes les modifications a appliquer a la fiche de cours. ' +
      'Reponds UNIQUEMENT avec un JSON valide, sans backticks:\n' +
      '{"changes":[{"action":"add_warning|add_example|add_keyPoint|add_concept|update_content|add_section",' +
      '"section":"titre exact de la section cible (ou nouveau titre si add_section)",' +
      '"content":"le texte a ajouter ou le nouveau contenu",' +
      '"reason":"pourquoi ce changement"}],' +
      '"summary":"resume en 1 phrase des changements",' +
      '"verificationNote":"ce qui a ete verifie/corrige"}';

    const r = await callClaude(
      sysSt1,
      'STRUCTURE DE LA FICHE "' + (fiche.metadata?.title || '') + '":\n' + ficheStructure + 
      '\n\nDISCUSSION COMPLETE:\n' + discTrunc,
      SONNET,
      4000
    );

    const changes = parseJ(r);
    if (!changes || !changes.changes?.length) {
      console.error('No changes extracted:', r.slice(0, 500));
      showToast('Aucune modification detectee. Reformule ta demande.', true);
      hideLoading();
      return;
    }

    showLoading('Application de ' + changes.changes.length + ' modifications...');

    // STEP 2: Apply changes locally (no IA needed)
    const u = JSON.parse(JSON.stringify(fiche));
    const applied = [];

    changes.changes.forEach(ch => {
      if (!ch.content) return;

      // Find target section (fuzzy match)
      let sec = u.base?.sections?.find(s => 
        s.title.toLowerCase().includes((ch.section || '').toLowerCase().slice(0, 20))
      );

      if (ch.action === 'add_section') {
        // Create new section
        const newSec = {
          title: ch.section || ch.content.split('.')[0],
          content: ch.content,
          concepts: [],
          keyPoints: [],
          warnings: [],
          examples: []
        };
        u.base.sections.push(newSec);
        applied.push('Nouvelle section: ' + newSec.title);
        return;
      }

      // Default to first section if no match
      if (!sec) sec = u.base?.sections?.[0];
      if (!sec) return;

      switch (ch.action) {
        case 'add_warning':
          sec.warnings.push(ch.content);
          applied.push('Warning: ' + ch.content.slice(0, 60));
          break;
        case 'add_example':
          sec.examples.push(ch.content);
          applied.push('Example: ' + ch.content.slice(0, 60));
          break;
        case 'add_keyPoint':
          sec.keyPoints.push(ch.content);
          applied.push('KeyPoint: ' + ch.content.slice(0, 60));
          break;
        case 'add_concept':
          const parts = ch.content.split(':');
          sec.concepts.push({
            term: (parts[0] || ch.content).trim(),
            definition: (parts.slice(1).join(':') || ch.content).trim(),
            ref: ''
          });
          applied.push('Concept: ' + (parts[0] || ch.content).slice(0, 60));
          break;
        case 'update_content':
          // Append to existing content rather than replace
          sec.content = (sec.content || '') + '\n\n' + ch.content;
          applied.push('Contenu enrichi: ' + sec.title);
          break;
        default:
          // Treat unknown actions as keyPoints
          sec.keyPoints.push(ch.content);
          applied.push('Point: ' + ch.content.slice(0, 60));
      }
    });

    if (!applied.length) {
      showToast('Aucune modification applicable', true);
      hideLoading();
      return;
    }

    // Add enrichment record
    u.enrichments.push({
      id: 'enr-disc-' + Date.now(),
      date: new Date().toISOString().split('T')[0],
      source: { type: 'discussion' },
      trigger: 'discussion',
      summary: changes.summary || applied.length + ' modifications appliquees',
      addedPoints: applied
    });

    // Add verification note
    if (changes.verificationNote) {
      if (!u.metadata.verificationNotes) u.metadata.verificationNotes = [];
      u.metadata.verificationNotes.push(
        new Date().toISOString().split('T')[0] + ': ' + changes.verificationNote
      );
    }

    // Increment version
    u.metadata.version = (u.metadata.version || 1) + 1;

    // Push to GitHub
    const ex = await ghGet(getFichePath());
    await ghPut(getFichePath(), u, 'Discussion v' + u.metadata.version + ': ' + (changes.summary || '').slice(0, 50), ex?.sha);
    fiche = u;

    // Save discussion as applied
    await saveDiscussion('applied');

    showToast('Fiche v' + u.metadata.version + ' — ' + applied.length + ' modifications !');
    
    // Show what was applied in the chat
    chatMsgs.push({
      role: 'assistant',
      content: '✅ **Fiche mise a jour (v' + u.metadata.version + ')**\n\n' +
        '**' + applied.length + ' modifications appliquees:**\n' +
        applied.map(a => '- ' + a).join('\n') +
        (changes.summary ? '\n\n*' + changes.summary + '*' : '') +
        '\n\nClique sur **Fiche** pour voir les changements.'
    });

    // Auto-switch to fiche
    currentView = 'fiche';

  } catch (e) {
    console.error('Apply error:', e);
    showToast('Erreur: ' + e.message, true);
  }

  hideLoading();
  render();
}

// Re-wire the global function
function applyDiscussionChanges() { requireToken(() => _doApplyChanges()); }
window.applyDiscussionChanges = applyDiscussionChanges;

console.log('v16.2: Discussion apply uses 2-step (extract changes + apply locally)');

// ============================================
// === SECTION 4: Enrichissement (integrate into sections)
// ============================================
// StudyForge v16.3 - Enrichir: integrate directly into fiche sections
// Before: just added raw points to enrichments[] as an appendix
// After: extracts structured changes + applies into the right sections (like discuss-fix.js)

enrichDoc = async function() {
  if (!hasToken()) { requireToken(enrichDoc); return; }
  const txt = document.getElementById('enrich-input')?.value?.trim();
  if (!txt || !fiche || !selCat || !ficheSlug) { showToast('Colle un texte d\'abord', true); return; }

  showLoading('Analyse et comparaison...');

  // Build fiche context: section titles + existing keyPoints/warnings/concepts
  const ficheCtx = (fiche.base?.sections || []).map((s, i) =>
    'Section ' + i + ': "' + s.title + '"\n' +
    '  KeyPoints: ' + (s.keyPoints || []).join(' | ') + '\n' +
    '  Warnings: ' + (s.warnings || []).join(' | ') + '\n' +
    '  Concepts: ' + (s.concepts || []).map(c => c.term).join(', ') + '\n' +
    '  Examples: ' + (s.examples || []).length + ' existants'
  ).join('\n');

  try {
    // STEP 1: IA compares article vs fiche and extracts structured changes
    const sys = 'Tu es un expert en gestion de patrimoine, fiscalite et finance. ' +
      'L\'utilisateur a une fiche de cours existante et colle un NOUVEL ARTICLE. ' +
      'Compare les deux et extrait:\n' +
      '1. Les informations NOUVELLES (pas dans la fiche)\n' +
      '2. Les CONTRADICTIONS (article dit different de la fiche)\n' +
      '3. Les PRECISIONS (article complete ce qui est dans la fiche)\n\n' +
      'Reponds UNIQUEMENT avec un JSON valide, sans backticks:\n' +
      '{"changes":[{"action":"add_keyPoint|add_warning|add_concept|add_example|update_content",' +
      '"section":"titre de la section cible (existante)",' +
      '"content":"le texte a ajouter",' +
      '"reason":"nouveau|contradiction|precision"}],' +
      '"contradictions":["description de chaque contradiction detectee"],' +
      '"summary":"resume en 1-2 phrases de ce que l\'article apporte",' +
      '"nothingNew":false}\n\n' +
      'Si l\'article n\'apporte RIEN de nouveau, mets nothingNew:true et changes:[].\n' +
      'IMPORTANT: le contenu de chaque change doit etre PRECIS et FACTUEL, pas vague.';

    const r = await callClaude(
      sys,
      'FICHE EXISTANTE:\n' + ficheCtx + '\n\nNOUVEL ARTICLE:\n' + txt.slice(0, 10000),
      SONNET,
      4000
    );

    const result = parseJ(r);
    if (!result) {
      console.error('Enrich parse fail:', r.slice(0, 500));
      showToast('Erreur analyse. Reessaie.', true);
      hideLoading();
      return;
    }

    // Nothing new?
    if (result.nothingNew || !result.changes?.length) {
      showToast('Rien de nouveau dans cet article par rapport a la fiche', true);
      hideLoading();
      // Still open discussion to explain
      chatMsgs = [{
        role: 'assistant',
        content: '📄 **Analyse de l\'article**\n\n' + (result.summary || 'L\'article ne contient pas d\'informations nouvelles par rapport a la fiche existante.') +
          (result.contradictions?.length ? '\n\n⚠️ **Contradictions detectees:**\n' + result.contradictions.map(c => '- ' + c).join('\n') : '')
      }];
      currentView = 'discuss';
      render();
      return;
    }

    showLoading('Integration de ' + result.changes.length + ' points...');

    // STEP 2: Apply changes locally
    const u = JSON.parse(JSON.stringify(fiche));
    if (!u.enrichments) u.enrichments = [];
    const applied = [];

    result.changes.forEach(ch => {
      if (!ch.content) return;

      // Find target section
      let sec = u.base?.sections?.find(s =>
        s.title.toLowerCase().includes((ch.section || '').toLowerCase().slice(0, 20))
      );
      if (!sec) sec = u.base?.sections?.[0];
      if (!sec) return;

      switch (ch.action) {
        case 'add_warning':
          sec.warnings.push(ch.content);
          applied.push('⚠️ ' + ch.content.slice(0, 80));
          break;
        case 'add_example':
          sec.examples.push(ch.content);
          applied.push('💡 ' + ch.content.slice(0, 80));
          break;
        case 'add_keyPoint':
          sec.keyPoints.push(ch.content);
          applied.push('→ ' + ch.content.slice(0, 80));
          break;
        case 'add_concept':
          const parts = ch.content.split(':');
          sec.concepts.push({
            term: (parts[0] || ch.content).trim(),
            definition: (parts.slice(1).join(':') || ch.content).trim(),
            ref: ''
          });
          applied.push('📖 ' + (parts[0] || ch.content).slice(0, 80));
          break;
        case 'update_content':
          sec.content = (sec.content || '') + '\n\n' + ch.content;
          applied.push('📝 Contenu enrichi: ' + sec.title);
          break;
        default:
          sec.keyPoints.push(ch.content);
          applied.push('→ ' + ch.content.slice(0, 80));
      }
    });

    if (!applied.length) {
      showToast('Rien a integrer', true);
      hideLoading();
      return;
    }

    // Add enrichment record (for traceability)
    u.enrichments.push({
      id: 'enr-art-' + Date.now(),
      date: new Date().toISOString().split('T')[0],
      source: { type: 'article' },
      trigger: 'import',
      summary: result.summary || applied.length + ' points integres depuis un article',
      addedPoints: applied
    });

    // Increment version
    u.metadata.version = (u.metadata.version || 1) + 1;

    // Push
    const ex = await ghGet(getFichePath());
    await ghPut(getFichePath(), u, 'Enrich v' + u.metadata.version + ': ' + (result.summary || '').slice(0, 40), ex?.sha);
    fiche = u;

    showToast('Fiche v' + u.metadata.version + ' enrichie — ' + applied.length + ' points !');

    // Open discussion with summary + contradictions
    chatMsgs = [{
      role: 'assistant',
      content: '✅ **Fiche enrichie (v' + u.metadata.version + ')**\n\n' +
        '**' + applied.length + ' points integres dans la fiche:**\n' +
        applied.map(a => '- ' + a).join('\n') +
        (result.contradictions?.length
          ? '\n\n⚠️ **Contradictions detectees** (non corrigees automatiquement, a verifier):\n' +
            result.contradictions.map(c => '- ' + c).join('\n')
          : '') +
        '\n\n*' + (result.summary || '') + '*' +
        '\n\nTu veux creuser un point ou corriger une contradiction ?'
    }];
    currentView = 'discuss';

  } catch (e) {
    console.error('Enrich error:', e);
    showToast('Erreur: ' + e.message, true);
  }

  hideLoading();
  render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

console.log('v16.3: Enrichir integrates directly into fiche sections');

// ============================================
// === SECTION 5: Import (robust JSON extraction)
// ============================================
// StudyForge v16.4 - Fix: JSON extraction from IA responses for import
// Problem: regex {"suggestedTitle"...} fails when IA puts JSON in code blocks or multiline
// Fix: robust extraction that handles code blocks, multiline, nested braces

// Better JSON extractor for import suggestions
function extractSuggestionJSON(text) {
  // Strategy 1: JSON in ```json ... ``` code block
  const codeBlock = text.match(/```(?:json)?\s*(\{[\s\S]*?"suggestedTitle"[\s\S]*?\})\s*```/);
  if (codeBlock) {
    const parsed = parseJ(codeBlock[1]);
    if (parsed?.suggestedTitle) return { meta: parsed, clean: text.replace(codeBlock[0], '').trim() };
  }

  // Strategy 2: Find {"suggestedTitle" and match braces properly
  const startIdx = text.indexOf('{"suggestedTitle"');
  if (startIdx === -1) {
    // Try with spaces/newlines: { "suggestedTitle"
    const altMatch = text.match(/\{\s*"suggestedTitle"/);
    if (!altMatch) return null;
    const altIdx = altMatch.index;
    const jsonStr = extractBalancedJSON(text, altIdx);
    if (jsonStr) {
      const parsed = parseJ(jsonStr);
      if (parsed?.suggestedTitle) return { meta: parsed, clean: text.replace(jsonStr, '').trim() };
    }
    return null;
  }

  const jsonStr = extractBalancedJSON(text, startIdx);
  if (jsonStr) {
    const parsed = parseJ(jsonStr);
    if (parsed?.suggestedTitle) return { meta: parsed, clean: text.replace(jsonStr, '').trim() };
  }

  // Strategy 3: Greedy match as fallback
  const greedy = text.match(/\{[^{}]*"suggestedTitle"[^{}]*"suggestedCategory"[^{}]*\}/);
  if (greedy) {
    const parsed = parseJ(greedy[0]);
    if (parsed?.suggestedTitle) return { meta: parsed, clean: text.replace(greedy[0], '').trim() };
  }

  return null;
}

// Extract balanced JSON starting at position idx
function extractBalancedJSON(text, idx) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = idx; i < text.length; i++) {
    const ch = text[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"' && !escaped) { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    if (ch === '}') { depth--; if (depth === 0) return text.slice(idx, i + 1); }
  }
  return null;
}

// Override doAnalysis with robust extraction
doAnalysis = async function(text) {
  showLoading('Analyse IA du document...');
  impStep = 'discuss'; impMsgs = [];
  const catList = cats.map(c => c.id + ' (' + c.name + ')').join(', ');
  const sys = 'Tu es un assistant pedagogique expert en gestion de patrimoine, finance et fiscalite. ' +
    'L\'utilisateur t\'envoie le contenu brut d\'un document. Tu dois:\n' +
    '1. IDENTIFIER le sujet\n2. Proposer un TITRE\n' +
    '3. SUGGERER la CATEGORIE parmi: ' + catList + '. Si aucune ne colle: "NOUVELLE: nom"\n' +
    '4. ANALYSER: points forts, erreurs, manques, refs legales\n' +
    '5. PROPOSER ameliorations\n6. POSER 2-3 questions\n\n' +
    'Francais. Markdown pour structurer.\n\n' +
    'A LA FIN de ta reponse, ajoute ce JSON sur UNE SEULE LIGNE, sans backticks, sans bloc code:\n' +
    '{"suggestedTitle":"titre propose","suggestedCategory":"id_categorie","analysis":"resume 1 phrase"}\n\n' +
    'IMPORTANT: le JSON doit etre sur une seule ligne, PAS dans un bloc ```json```.';

  try {
    render();
    const r = await callClaude(sys, 'Contenu:\n\n' + text.slice(0, 14000), SONNET);

    let display = r, meta = null;
    const extracted = extractSuggestionJSON(r);
    if (extracted) {
      meta = extracted.meta;
      display = extracted.clean;
      // Also clean up any leftover code block markers
      display = display.replace(/```json\s*```/g, '').replace(/```\s*```/g, '').trim();
    }

    impMsgs.push({ role: 'assistant', content: display, meta: meta });
    
    if (meta) {
      console.log('Import suggestion extracted:', meta.suggestedTitle, '→', meta.suggestedCategory);
    } else {
      console.warn('Could not extract suggestion JSON from response');
    }

    setStatus('', false);
  } catch (e) {
    impMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message });
    setStatus('', false);
  }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

// Also fix sendImpMsg to extract updated suggestions
sendImpMsg = async function() {
  const msg = document.getElementById('imp-chat')?.value?.trim();
  if (!msg) return;
  document.getElementById('imp-chat').value = '';
  impMsgs.push({ role: 'user', content: msg }); render();
  setStatus('Reflexion...');
  const catList = cats.map(c => c.id + ' (' + c.name + ')').join(', ');
  const sys = 'Assistant pedagogique expert. Discussion document -> fiche. Categories: ' + catList + '. ' +
    'Continue naturellement, challenge, ameliore. Si tu mets a jour tes suggestions, ajoute le JSON sur UNE SEULE LIGNE sans backticks: ' +
    '{"suggestedTitle":"...","suggestedCategory":"...","analysis":"..."} Francais.';
  try {
    const r = await callClaude(sys, impMsgs.map(m => ({ role: m.role, content: m.content })));
    let display = r, meta = null;
    const extracted = extractSuggestionJSON(r);
    if (extracted) { meta = extracted.meta; display = extracted.clean; }
    impMsgs.push({ role: 'assistant', content: display, meta: meta });
  } catch (e) { impMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message }); }
  setStatus('', false); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

console.log('v16.4: Robust JSON extraction for import suggestions + pre-fill title/category');
