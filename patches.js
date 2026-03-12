// StudyForge v16 - Fix 3 bugs: slug path, analysis render, quiz consistency

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

// === BUG FIX 3: Store original file slug ===
let ficheSlug = null; // Original filename without .json

function getFichePath() {
  if (!selCat || !ficheSlug) return null;
  return 'data/' + selCat.id + '/' + ficheSlug + '.json';
}

// === MEMORY CACHE ===
const _cache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

const _origGhRead = ghRead;
ghGet = async function(p) {
  const cached = _cache.get(p);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return { content: cached.data, sha: cached.sha };
  try {
    const d = await _origGhRead(p);
    const b = atob(d.content);
    const bytes = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    const parsed = JSON.parse(new TextDecoder('utf-8').decode(bytes));
    _cache.set(p, { data: parsed, sha: d.sha, ts: Date.now() });
    return { content: parsed, sha: d.sha };
  } catch { return null; }
};

const _origGhPut = ghPut;
ghPut = async function(path, content, msg, sha) {
  if (path.endsWith('.json') && path.includes('/') && !path.endsWith('_meta.json') && !path.endsWith('index.json')) {
    const data = typeof content === 'string' ? JSON.parse(content) : content;
    const errors = validateFicheJSON(data);
    if (errors.length > 0) { console.error('BLOCKED ' + path + ':', errors); throw new Error('Validation: ' + errors.join(', ')); }
    console.log('OK: ' + path + ' v' + (data.metadata?.version || '?'));
  }
  _cache.delete(path);
  const dir = path.substring(0, path.lastIndexOf('/'));
  _cache.forEach((v, k) => { if (k.startsWith(dir)) _cache.delete(k); });
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
  if (data.metadata) {
    if (!data.metadata.title) errors.push('metadata.title manquant');
    if (!data.metadata.category) errors.push('metadata.category manquant');
    if (data.metadata.version !== undefined) data.metadata.version = parseInt(data.metadata.version) || 1;
  }
  if (data.base) {
    if (!Array.isArray(data.base.sections)) errors.push('base.sections pas un array');
    else if (data.base.sections.length === 0) errors.push('base.sections vide');
    else data.base.sections.forEach((s, i) => {
      if (!s.title) errors.push('section[' + i + '].title manquant');
      if (!Array.isArray(s.concepts)) s.concepts = [];
      if (!Array.isArray(s.keyPoints)) s.keyPoints = [];
      if (!Array.isArray(s.warnings)) s.warnings = [];
      if (!Array.isArray(s.examples)) s.examples = [];
    });
  }
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
overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(6,6,16,0.85);display:none;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:16px';
overlay.innerHTML = '<div style="width:40px;height:40px;border:3px solid #7B68EE;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div><p id="loading-text" style="color:#a29bfe;font-size:15px;font-weight:600;font-family:Outfit,sans-serif">Chargement...</p><p style="color:#6b6b88;font-size:11px;font-family:Outfit,sans-serif">Powered by Claude AI</p>';
document.body.appendChild(overlay);
function showLoading(t) { document.getElementById('loading-text').textContent = t || 'Chargement...'; overlay.style.display = 'flex'; }
function hideLoading() { overlay.style.display = 'none'; }

function updateWeakPoints(ficheData, qResults, type) {
  if (!ficheData.quiz) ficheData.quiz = { totalAttempts: 0, history: [], weakPoints: [] };
  if (!ficheData.quiz._wpSuccess) ficheData.quiz._wpSuccess = {};
  if (type === 'qcm') {
    qResults.forEach(r => {
      const q = r.question;
      if (r.ok) {
        ficheData.quiz._wpSuccess[q] = (ficheData.quiz._wpSuccess[q] || 0) + 1;
        if (ficheData.quiz._wpSuccess[q] >= 2) { ficheData.quiz.weakPoints = ficheData.quiz.weakPoints.filter(wp => wp !== q); delete ficheData.quiz._wpSuccess[q]; }
      } else { ficheData.quiz._wpSuccess[q] = 0; if (!ficheData.quiz.weakPoints.includes(q)) ficheData.quiz.weakPoints.push(q); }
    });
  }
}

// PERSIST DISCUSSION - uses ficheSlug
async function saveDiscussion(status) {
  if (!fiche || !selCat || !hasToken() || chatMsgs.length < 2 || !ficheSlug) return;
  const u = JSON.parse(JSON.stringify(fiche));
  if (!u.discussions) u.discussions = [];
  const preview = chatMsgs.slice(0, 2).map(m => m.content.slice(0, 50)).join(' | ');
  u.discussions.push({ id: 'disc-' + Date.now(), date: new Date().toISOString().split('T')[0], status: status || 'open', messageCount: chatMsgs.length, preview, messages: chatMsgs.map(m => ({ role: m.role, content: m.content.slice(0, 2000) })) });
  if (u.discussions.length > 5) u.discussions = u.discussions.slice(-5);
  try {
    const path = getFichePath();
    const ex = await ghGet(path);
    await ghPut(path, u, 'Save discussion', ex?.sha);
    fiche = u;
  } catch (e) { console.error('Discussion save error:', e); }
}
window.saveDiscussion = saveDiscussion;

function loadPreviousDiscussion() {
  if (!fiche?.discussions?.length) return;
  const last = fiche.discussions[fiche.discussions.length - 1];
  if (last.status === 'open' && last.messages?.length) {
    chatMsgs = last.messages.map(m => ({ role: m.role, content: m.content }));
    showToast('Discussion restauree (' + chatMsgs.length + ' msg)');
  }
}

// === QUIZ GEN - BUG FIX 1: better prompt for consistency ===
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
    qcm: 'Genere exactement ' + qCount + ' QCM. Niveau ' + levels[qLevel] + (wp ? ' Points faibles (insiste): ' + wp : '') + '. REGLE ABSOLUE: le champ correct DOIT correspondre a l\'explication. Verifie chaque question. JSON array sans backticks: [{"id":1,"question":"","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":""}]',
    open: 'Genere exactement ' + qCount + ' questions ouvertes. Niveau ' + levels[qLevel] + '. JSON array sans backticks: [{"id":1,"question":"","expectedPoints":["","",""],"difficulty":"' + qLevel + '","hint":""}]',
    flashcard: 'Genere exactement ' + qCount + ' flashcards. Niveau ' + levels[qLevel] + '. JSON array sans backticks: [{"id":1,"front":"","back":""}]'
  };
  try {
    const r = await callClaude(
      'Tu generes des quiz pedagogiques patrimoine/fiscalite. JSON valide UNIQUEMENT, sans backticks. ' + qCount + ' elements. IMPORTANT pour les QCM: verifie que le champ "correct" correspond EXACTEMENT a la bonne reponse dans l\'explication. Ne mets JAMAIS une lettre dans correct qui contredit l\'explanation.',
      pr[qType] + '\n\nCONTENU:\n' + ctx.slice(0, 8000) + (en ? '\nENRICHISSEMENTS: ' + en.slice(0, 1000) : ''),
      HAIKU, maxTok
    );
    const p = parseJ(r);
    if (p && Array.isArray(p)) { quiz = p; showToast(p.length + ' questions generees !'); }
    else { console.error('Quiz parse fail:', r.slice(0, 500)); showToast('Erreur generation. Reessaie.', true); }
  } catch (e) { console.error('Quiz error:', e); showToast('Erreur: ' + e.message, true); }
  hideLoading(); render();
};

correctQuiz = async function() {
  if (!quiz) return; showLoading('Correction...');
  qAnalysis = null; qSuggestions = null;
  if (qType === 'qcm') { qRes = quiz.map(q => ({ ...q, ua: qAns[q.id], ok: qAns[q.id] === q.correct })); hideLoading(); render(); return; }
  const txt = quiz.map(q => 'Q: ' + q.question + '\nR: ' + (qAns[q.id] || '(vide)')).join('\n\n');
  try {
    const r = await callClaude('Corrige. JSON sans backticks: [{"id":1,"score":0,"feedback":"","missingPoints":[""],"suggestion":""}]', txt + '\nAttendus: ' + JSON.stringify(quiz.map(q => ({ id: q.id, pts: q.expectedPoints }))), HAIKU);
    const p = parseJ(r); if (p) qRes = p;
  } catch (e) { setStatus('Erreur: ' + e.message); }
  hideLoading(); render();
};

// === BUG FIX 2: Reset analysisPatched flag before render ===
async function analyzeQuizErrors() {
  if (!qRes || !fiche) return;
  showLoading('Analyse de tes erreurs...');
  let errorsText = '';
  if (qType === 'qcm') {
    const wrong = qRes.filter(r => !r.ok);
    if (!wrong.length) { qAnalysis = 'Bravo, aucune erreur !'; hideLoading(); render(); return; }
    errorsText = wrong.map(w => 'Q: ' + w.question + '\nDonne: ' + ((w.options||[]).find(o => o.charAt(0) === w.ua)||'?') + '\nCorrect: ' + ((w.options||[]).find(o => o.charAt(0) === w.correct)||'?') + '\nExplication: ' + (w.explanation||'')).join('\n\n');
  } else {
    const weak = qRes.filter(r => r.score < 7);
    if (!weak.length) { qAnalysis = 'Tres bon resultat !'; hideLoading(); render(); return; }
    errorsText = weak.map(w => { const q = quiz.find(x => x.id === w.id); return 'Q: ' + (q?.question||'') + '\nScore: ' + w.score + '/10\nManque: ' + (w.missingPoints||[]).join(', '); }).join('\n\n');
  }
  try { qAnalysis = await callClaude('Tuteur expert. Analyse chaque erreur: pourquoi, explication legale, astuce memo. Markdown. Francais.', 'ERREURS:\n' + errorsText, HAIKU, 3000); } catch (e) { qAnalysis = 'Erreur: ' + e.message; }
  try {
    const ctx = JSON.stringify((fiche.base?.sections||[]).map(s => ({ title: s.title, keyPoints: s.keyPoints, warnings: s.warnings })));
    const r = await callClaude('Propose ameliorations fiche. JSON sans backticks: {"improvements":[{"type":"warning|example|concept|keyPoint","section":"titre","content":"texte","reason":"pourquoi"}],"summary":"resume"}', 'ERREURS:\n' + errorsText + '\nFICHE:\n' + ctx, HAIKU, 2000);
    qSuggestions = parseJ(r);
  } catch (e) { console.error('Suggestions:', e); }
  hideLoading();
  // CRITICAL FIX: clear the analysisPatched flag so render re-injects the section
  const content = $('content');
  if (content) delete content.dataset.analysisPatched;
  render();
  setTimeout(() => { const c = $('content'); if (c) c.scrollTop = c.scrollHeight; }, 100);
}
window.analyzeQuizErrors = analyzeQuizErrors;

// APPLY QUIZ IMPROVEMENTS - uses ficheSlug
async function applyQuizImprovements() {
  if (!qSuggestions?.improvements?.length || !fiche || !selCat || !ficheSlug) return;
  requireToken(async function() {
    showLoading('Amelioration de la fiche...');
    const u = JSON.parse(JSON.stringify(fiche));
    if (!u.enrichments) u.enrichments = [];
    if (!u.quiz) u.quiz = { totalAttempts: 0, history: [], weakPoints: [] };
    const applied = [];
    qSuggestions.improvements.forEach(imp => {
      const sec = u.base?.sections?.find(s => s.title.toLowerCase().includes((imp.section||'').toLowerCase().slice(0,15)));
      const t = sec || u.base?.sections?.[0]; if (!t) return;
      if (imp.type==='warning'&&imp.content) { t.warnings.push(imp.content); applied.push(imp.content); }
      else if (imp.type==='example'&&imp.content) { t.examples.push(imp.content); applied.push(imp.content); }
      else if (imp.type==='keyPoint'&&imp.content) { t.keyPoints.push(imp.content); applied.push(imp.content); }
      else if (imp.type==='concept'&&imp.content) { t.concepts.push({ term: imp.content.split(':')[0]||imp.content, definition: imp.content, ref: '' }); applied.push(imp.content); }
    });
    if (!applied.length) { showToast('Aucune amelioration', true); hideLoading(); return; }
    u.enrichments.push({ id: 'enr-qa-' + Date.now(), date: new Date().toISOString().split('T')[0], source: { type: 'quiz-analysis' }, trigger: 'quiz', summary: qSuggestions.summary || applied.length + ' ameliorations', addedPoints: applied });
    u.quiz.totalAttempts++; u.quiz.lastDate = new Date().toISOString().split('T')[0];
    if (qType === 'qcm' && qRes) {
      u.quiz.history.push({ date: u.quiz.lastDate, type: 'qcm', score: qRes.filter(r => r.ok).length + '/' + qRes.length, level: qLevel });
      updateWeakPoints(u, qRes, 'qcm');
    }
    u.metadata.version = (u.metadata.version || 1) + 1;
    try {
      const path = getFichePath();
      const ex = await ghGet(path);
      await ghPut(path, u, 'Quiz v' + u.metadata.version, ex?.sha);
      fiche = u; showToast('Fiche v' + u.metadata.version + ' amelioree !');
    } catch (e) { showToast('Erreur: ' + e.message, true); }
    hideLoading(); render();
  });
}
window.applyQuizImprovements = applyQuizImprovements;

sendMsg = async function() {
  const msg = $('chat-input')?.value?.trim();
  if (!msg || !fiche) return;
  $('chat-input').value = '';
  chatMsgs.push({ role: 'user', content: msg }); render();
  showLoading('Reflexion...');
  const ficheJSON = smartTruncateFiche(JSON.stringify(fiche), 12000);
  const sys = `Tuteur expert patrimoine/fiscalite/finance. Fiche:\n${ficheJSON}\n\nDetaille, pedagogique, exemples, references legales, challenge. Markdown. Francais. Pas de JSON.`;
  try {
    const r = await callClaude(sys, chatMsgs.map(m => ({ role: m.role, content: m.content })), SONNET, 4000);
    chatMsgs.push({ role: 'assistant', content: r });
  } catch (e) { chatMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message }); }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

// APPLY DISCUSSION - uses ficheSlug
async function _doApplyChanges() {
  if (!fiche || !selCat || !ficheSlug) return;
  if (chatMsgs.length < 1) { showToast('Discute d\'abord', true); return; }
  showLoading('Application des modifications...');
  const ficheJSON = smartTruncateFiche(JSON.stringify(fiche), 15000);
  const disc = chatMsgs.map(m => (m.role === 'user' ? 'USER' : 'EXPERT') + ': ' + m.content).join('\n\n').slice(0, 8000);
  const sys = 'Expert. APPLIQUE les modifications discutees. JSON complet sans backticks. metadata,base.sections(non vide),enrichments,quiz. Accents. CONSERVE existants. Incremente version.';
  try {
    const r = await callClaude(sys, 'FICHE:\n' + ficheJSON + '\n\nDISCUSSION:\n' + disc, SONNET, 8000);
    const p = parseJ(r);
    if (!p) { console.error('PARSE:', r.slice(0,500)); showToast('JSON invalide - F12', true); hideLoading(); return; }
    const err = validateFicheJSON(p);
    if (err.length) { showToast('Validation: ' + err.join(', '), true); hideLoading(); return; }
    p.metadata.version = (fiche.metadata?.version || 1) + 1;
    const path = getFichePath();
    const ex = await ghGet(path);
    await ghPut(path, p, 'Discuss v' + p.metadata.version, ex?.sha);
    fiche = p;
    await saveDiscussion('applied');
    showToast('Fiche v' + p.metadata.version + ' sauvegardee !');
    currentView = 'fiche';
  } catch (e) { showToast('Erreur: ' + e.message, true); }
  hideLoading(); render();
}
function applyDiscussionChanges() { requireToken(() => _doApplyChanges()); }
window.applyDiscussionChanges = applyDiscussionChanges;

doAnalysis = async function(text) {
  showLoading('Analyse IA...');
  impStep = 'discuss'; impMsgs = [];
  const catList = cats.map(c => c.id + ' (' + c.name + ')').join(', ');
  const sys = 'Expert patrimoine/finance/fiscalite. Analyse document: sujet, TITRE, CATEGORIE parmi ' + catList + ' (ou NOUVELLE:nom). Points forts/erreurs/manques. Ameliorations. 2-3 questions. Markdown. Francais. Fin: JSON {"suggestedTitle":"","suggestedCategory":"","analysis":""}';
  try {
    render();
    const r = await callClaude(sys, 'Contenu:\n\n' + text.slice(0, 14000), SONNET);
    let display = r, meta = null;
    const jm = r.match(/\{"suggestedTitle"[\s\S]*?\}/);
    if (jm) { meta = parseJ(jm[0]); display = r.replace(jm[0], '').trim(); }
    impMsgs.push({ role: 'assistant', content: display, meta: meta });
  } catch (e) { impMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message }); }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

const _origSave = saveImportFiche;
saveImportFiche = async function() {
  if (!hasToken()) { requireToken(saveImportFiche); return; }
  showLoading('Structuration...'); await _origSave(); hideLoading();
  showToast('Fiche creee !');
};
const _origEnrich = enrichDoc;
enrichDoc = async function() {
  if (!hasToken()) { requireToken(enrichDoc); return; }
  showLoading('Analyse...'); await _origEnrich(); hideLoading();
};

// Override loadFiche to capture original slug + restore discussions
const _origLoadFiche = loadFiche;
loadFiche = async function(id) {
  ficheSlug = id; // CRITICAL: store original file slug
  await _origLoadFiche(id);
  loadPreviousDiscussion();
};

// RENDER
const _origRender = render;
render = function() {
  _origRender();
  const content = $('content'); if (!content) return;

  if (typeof marked !== 'undefined') {
    content.querySelectorAll('.msg-ai').forEach(el => {
      if (el.dataset.mdRendered) return;
      el.dataset.mdRendered = 'true';
      const raw = el.textContent;
      if (raw) { el.style.whiteSpace = 'normal'; el.innerHTML = renderMd(raw); }
    });
  }

  if (currentView === 'quiz' && fiche) {
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
    if (qRes && qType !== 'flashcard' && !content.dataset.analysisPatched) {
      content.dataset.analysisPatched = 'true';
      const container = content.querySelector('[style*="max-width:780px"]'); if (!container) return;
      const hasErr = qType === 'qcm' ? qRes.some(r => !r.ok) : qRes.some(r => r.score < 7);
      const aDiv = document.createElement('div'); aDiv.style.cssText = 'margin-top:14px';
      if (!qAnalysis && hasErr) {
        aDiv.innerHTML = '<div style="background:#111122;border:1px solid #f87171;border-radius:14px;padding:20px;text-align:center"><p style="font-size:14px;font-weight:600;color:#f87171;margin-bottom:8px">\u{1F50D} Des erreurs detectees</p><p style="font-size:12px;color:#9999b0;margin-bottom:14px">L\'IA analyse tes erreurs et propose des ameliorations</p><button class="btn" onclick="analyzeQuizErrors()" style="background:#f87171;color:#fff;padding:12px 24px;font-size:14px">Analyser mes erreurs</button></div>';
      } else if (!qAnalysis && !hasErr) {
        aDiv.innerHTML = '<div style="background:#111122;border:1px solid #34d399;border-radius:14px;padding:20px;text-align:center"><p style="font-size:14px;font-weight:600;color:#34d399">\u2705 Parfait !</p></div>';
      } else if (qAnalysis) {
        let h = '<div style="background:#111122;border:1px solid #7B68EE;border-radius:14px;padding:20px;margin-bottom:14px"><h4 style="font-size:14px;color:#7B68EE;margin-bottom:10px">\u{1F9E0} Analyse</h4><div style="font-size:12.5px;color:#9999b0;line-height:1.7">' + renderMd(qAnalysis) + '</div></div>';
        if (qSuggestions?.improvements?.length) {
          h += '<div style="background:#111122;border:1px solid #fbbf24;border-radius:14px;padding:20px"><h4 style="font-size:14px;color:#fbbf24;margin-bottom:10px">\u{1F4DD} Ameliorations</h4>';
          qSuggestions.improvements.forEach(imp => {
            h += '<div style="padding:8px 0;border-bottom:1px solid #1a1a33;font-size:12px"><span style="color:#fbbf24">' + (imp.type||'').toUpperCase() + '</span>' + (imp.section ? ' <span style="color:#6b6b88">(' + esc(imp.section) + ')</span>' : '') + '<p style="color:#e8e8f0;margin-top:4px">' + esc(imp.content) + '</p></div>';
          });
          h += '<button class="btn btn-grn" onclick="applyQuizImprovements()" style="width:100%;padding:14px;font-size:14px;margin-top:14px">\u2713 Appliquer</button></div>';
        }
        aDiv.innerHTML = h;
      }
      container.appendChild(aDiv);
    }
  }

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

console.log('StudyForge v16: Fix slug path + analysis render + quiz consistency');
