// StudyForge v13 - Markdown rendering in chat bubbles + quiz analysis

// 0. LOAD MARKED.JS for markdown rendering
(function(){
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.1/marked.min.js';
  s.onload = function() {
    // Configure marked: no raw HTML, safe output
    marked.setOptions({ breaks: true, gfm: true });
    console.log('marked.js loaded');
  };
  document.head.appendChild(s);

  // Markdown styles for chat bubbles
  const style = document.createElement('style');
  style.textContent = `
    .md-content h1,.md-content h2,.md-content h3,.md-content h4{font-weight:700;margin:10px 0 6px;color:#e8e8f0}
    .md-content h1{font-size:16px} .md-content h2{font-size:14px} .md-content h3{font-size:13px} .md-content h4{font-size:12.5px}
    .md-content p{margin:4px 0;line-height:1.7}
    .md-content ul,.md-content ol{margin:6px 0;padding-left:20px}
    .md-content li{margin:3px 0;line-height:1.6}
    .md-content strong{color:#e8e8f0;font-weight:700}
    .md-content em{color:#9999b0;font-style:italic}
    .md-content code{background:#0d0d1a;padding:2px 6px;border-radius:4px;font-size:11px;font-family:monospace;color:#7B68EE}
    .md-content pre{background:#0d0d1a;padding:10px 14px;border-radius:8px;overflow-x:auto;margin:8px 0}
    .md-content pre code{background:none;padding:0;font-size:11px}
    .md-content blockquote{border-left:3px solid #7B68EE;padding:4px 12px;margin:8px 0;color:#9999b0}
    .md-content table{border-collapse:collapse;width:100%;margin:8px 0;font-size:11px}
    .md-content th,.md-content td{border:1px solid #1a1a33;padding:6px 10px;text-align:left}
    .md-content th{background:#0d0d1a;font-weight:600;color:#e8e8f0}
    .md-content hr{border:none;border-top:1px solid #1a1a33;margin:12px 0}
    .md-content a{color:#7B68EE;text-decoration:underline}
  `;
  document.head.appendChild(style);
})();

// Safe markdown render function
function renderMd(text) {
  if (!text) return '';
  if (typeof marked === 'undefined') return esc(text); // fallback if marked not loaded yet
  try {
    // Strip any raw HTML tags for safety
    const clean = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '');
    return '<div class="md-content">' + marked.parse(clean) + '</div>';
  } catch { return esc(text); }
}

// 1. UTF-8 FIX
const _origGhRead = ghRead;
ghGet = async function(p) {
  try {
    const d = await _origGhRead(p);
    const b = atob(d.content);
    const bytes = new Uint8Array(b.length);
    for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i);
    return { content: JSON.parse(new TextDecoder('utf-8').decode(bytes)), sha: d.sha };
  } catch { return null; }
};

// 2. MODELS
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

// 3. JSON VALIDATION
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
  return errors;
}

// 4. SAFE ghPut
const _origGhPut = ghPut;
ghPut = async function(path, content, msg, sha) {
  if (path.endsWith('.json') && path.includes('/') && !path.endsWith('_meta.json') && !path.endsWith('index.json')) {
    const data = typeof content === 'string' ? JSON.parse(content) : content;
    const errors = validateFicheJSON(data);
    if (errors.length > 0) {
      console.error('VALIDATION BLOCKED ' + path + ':', errors);
      throw new Error('Validation: ' + errors.join(', '));
    }
    console.log('OK: ' + path + ' v' + (data.metadata?.version || '?') + ' (' + (data.base?.sections?.length || 0) + ' sections)');
  }
  return _origGhPut(path, content, msg, sha);
};

// 5. SAFE TRUNCATION
function smartTruncateFiche(ficheJSON, maxLen) {
  if (ficheJSON.length <= maxLen) return ficheJSON;
  try {
    const f = JSON.parse(ficheJSON);
    if (f.base?.sections) f.base.sections.forEach(s => {
      if (s.content && s.content.length > 500) s.content = s.content.slice(0, 400) + '...[tronque]';
    });
    let r = JSON.stringify(f);
    if (r.length <= maxLen) return r;
    if (f.enrichments?.length > 3) { f.enrichments = f.enrichments.slice(-3); r = JSON.stringify(f); }
    if (r.length <= maxLen) return r;
    if (f.base?.sections) f.base.sections.forEach(s => { s.examples = []; s.warnings = s.warnings?.slice(0, 1) || []; });
    r = JSON.stringify(f);
    if (r.length <= maxLen) return r;
    if (f.base?.sections) f.base.sections.forEach(s => { s.content = '[voir fiche complete]'; });
    return JSON.stringify(f);
  } catch { return ficheJSON.slice(0, maxLen); }
}

// 6. QUIZ STATE
let qCount = 10;
let qLevel = 'modere';
let qAnalysis = null;
let qSuggestions = null;

// 7. LOADING OVERLAY
const overlay = document.createElement('div');
overlay.id = 'loading-overlay';
overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(6,6,16,0.85);display:none;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:16px';
overlay.innerHTML = '<div style="width:40px;height:40px;border:3px solid #7B68EE;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div><p id="loading-text" style="color:#a29bfe;font-size:15px;font-weight:600;font-family:Outfit,sans-serif">Chargement...</p><p style="color:#6b6b88;font-size:11px;font-family:Outfit,sans-serif">Powered by Claude AI</p>';
document.body.appendChild(overlay);
function showLoading(t) { document.getElementById('loading-text').textContent = t || 'Chargement...'; overlay.style.display = 'flex'; }
function hideLoading() { overlay.style.display = 'none'; }

// 8. QUIZ GEN (Haiku)
genQuiz = async function() {
  if (!fiche) return;
  showLoading('Generation de ' + qCount + ' questions (' + qLevel + ')...');
  qRes = null; qAns = {}; qFlip = {}; qAnalysis = null; qSuggestions = null;
  const ct = JSON.stringify(fiche.base?.sections || []);
  const en = (fiche.enrichments || []).map(e => (e.addedPoints || []).join(', ')).join(' | ');
  const wp = (fiche.quiz?.weakPoints || []).join(', ');
  const levels = {
    basique: 'Niveau BASIQUE: memorisation, definitions. Pas de pieges.',
    modere: 'Niveau MODERE: application, comprehension, subtilites.',
    expert: 'Niveau EXPERT: cas pratiques complexes, pieges, calculs, articulations entre concepts.'
  };
  const pr = {
    qcm: 'Genere exactement ' + qCount + ' QCM. ' + levels[qLevel] + ' Points faibles: ' + wp + '. JSON sans backticks: [{"id":1,"question":"","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":""}]',
    open: 'Genere exactement ' + qCount + ' questions ouvertes. ' + levels[qLevel] + ' JSON sans backticks: [{"id":1,"question":"","expectedPoints":["","",""],"difficulty":"' + qLevel + '","hint":""}]',
    flashcard: 'Genere exactement ' + qCount + ' flashcards. ' + levels[qLevel] + ' JSON sans backticks: [{"id":1,"front":"","back":""}]'
  };
  try {
    const r = await callClaude('Quiz patrimoine/fiscalite. JSON sans backticks. EXACTEMENT ' + qCount + ' elements.', pr[qType] + '\nFiche:\n' + ct + '\nEnrichissements:\n' + en, HAIKU);
    const p = parseJ(r); if (p) quiz = p; else setStatus('Erreur.');
  } catch (e) { setStatus('Erreur: ' + e.message); }
  hideLoading(); render();
};

// 9. CORRECTION
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

// 10. QUIZ ERROR ANALYSIS
async function analyzeQuizErrors() {
  if (!qRes || !fiche) return;
  showLoading('Analyse detaillee de tes erreurs...');
  let errorsText = '';
  if (qType === 'qcm') {
    const wrong = qRes.filter(r => !r.ok);
    if (wrong.length === 0) { qAnalysis = 'Bravo, aucune erreur !'; hideLoading(); render(); return; }
    errorsText = wrong.map(w => {
      const userAns = (w.options || []).find(o => o.charAt(0) === w.ua) || 'Pas de reponse';
      const goodAns = (w.options || []).find(o => o.charAt(0) === w.correct) || '?';
      return 'Question: ' + w.question + '\nReponse donnee: ' + userAns + '\nBonne reponse: ' + goodAns + '\nExplication: ' + (w.explanation || '');
    }).join('\n\n');
  } else {
    const weak = qRes.filter(r => r.score < 7);
    if (weak.length === 0) { qAnalysis = 'Tres bon resultat !'; hideLoading(); render(); return; }
    errorsText = weak.map(w => {
      const q = quiz.find(x => x.id === w.id);
      return 'Question: ' + (q?.question || '') + '\nScore: ' + w.score + '/10\nFeedback: ' + w.feedback + '\nPoints manquants: ' + (w.missingPoints || []).join(', ');
    }).join('\n\n');
  }
  try {
    qAnalysis = await callClaude('Tuteur expert patrimoine/fiscalite. Analyse chaque erreur: pourquoi l\'eleve s\'est trompe, explication pedagogique avec references legales, astuce mnemotechnique. Precis, pedagogique, encourageant. Francais. Utilise du markdown (## titres, **gras**, listes) pour structurer.', 'ERREURS:\n' + errorsText, HAIKU, 3000);
  } catch (e) { qAnalysis = 'Erreur analyse: ' + e.message; }
  try {
    const ficheCtx = JSON.stringify((fiche.base?.sections || []).map(s => ({ title: s.title, keyPoints: s.keyPoints, warnings: s.warnings })));
    const sugR = await callClaude('Propose ameliorations pour la fiche. JSON sans backticks: {"improvements":[{"type":"warning|example|concept|keyPoint","section":"titre section","content":"texte","reason":"pourquoi"}],"summary":"resume"}', 'ERREURS:\n' + errorsText + '\nFICHE:\n' + ficheCtx, HAIKU, 2000);
    qSuggestions = parseJ(sugR);
  } catch (e) { console.error('Suggestions error:', e); }
  hideLoading(); render();
  setTimeout(() => { const c = $('content'); if (c) c.scrollTop = c.scrollHeight; }, 100);
}
window.analyzeQuizErrors = analyzeQuizErrors;

// 11. APPLY QUIZ IMPROVEMENTS
async function applyQuizImprovements() {
  if (!qSuggestions?.improvements?.length || !fiche || !selCat) return;
  requireToken(async function() {
    showLoading('Amelioration de la fiche...');
    const u = JSON.parse(JSON.stringify(fiche));
    if (!u.enrichments) u.enrichments = [];
    if (!u.quiz) u.quiz = { totalAttempts: 0, history: [], weakPoints: [] };
    const applied = [];
    qSuggestions.improvements.forEach(imp => {
      const sec = u.base?.sections?.find(s => s.title.toLowerCase().includes((imp.section || '').toLowerCase().slice(0, 15)));
      const target = sec || u.base?.sections?.[0];
      if (!target) return;
      if (imp.type === 'warning' && imp.content) { target.warnings.push(imp.content); applied.push(imp.content); }
      else if (imp.type === 'example' && imp.content) { target.examples.push(imp.content); applied.push(imp.content); }
      else if (imp.type === 'keyPoint' && imp.content) { target.keyPoints.push(imp.content); applied.push(imp.content); }
      else if (imp.type === 'concept' && imp.content) { target.concepts.push({ term: imp.content.split(':')[0] || imp.content, definition: imp.content, ref: '' }); applied.push(imp.content); }
    });
    if (applied.length === 0) { setStatus('Aucune amelioration'); hideLoading(); return; }
    u.enrichments.push({ id: 'enr-qa-' + Date.now(), date: new Date().toISOString().split('T')[0], source: { type: 'quiz-analysis' }, trigger: 'quiz', summary: qSuggestions.summary || applied.length + ' ameliorations', addedPoints: applied });
    u.quiz.totalAttempts++;
    u.quiz.lastDate = new Date().toISOString().split('T')[0];
    if (qType === 'qcm' && qRes) {
      u.quiz.history.push({ date: u.quiz.lastDate, type: 'qcm', score: qRes.filter(r => r.ok).length + '/' + qRes.length, level: qLevel });
      qRes.filter(r => !r.ok).forEach(w => { if (!u.quiz.weakPoints.includes(w.question)) u.quiz.weakPoints.push(w.question); });
    }
    u.metadata.version = (u.metadata.version || 1) + 1;
    try {
      const slug = fiche.metadata?.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'f';
      const ex = await ghGet('data/' + selCat.id + '/' + slug + '.json');
      await ghPut('data/' + selCat.id + '/' + slug + '.json', u, 'Quiz analysis v' + u.metadata.version, ex?.sha);
      fiche = u; setStatus('Fiche v' + u.metadata.version + ' amelioree !');
    } catch (e) { setStatus('Erreur: ' + e.message); }
    hideLoading(); render();
  });
}
window.applyQuizImprovements = applyQuizImprovements;

// 12. DISCUSSION - SONNET
sendMsg = async function() {
  const msg = $('chat-input')?.value?.trim();
  if (!msg || !fiche) return;
  $('chat-input').value = '';
  chatMsgs.push({ role: 'user', content: msg }); render();
  showLoading('Reflexion approfondie...');
  const ficheJSON = smartTruncateFiche(JSON.stringify(fiche), 12000);
  const sys = `Tu es un tuteur expert en gestion de patrimoine, fiscalite et finance. Fiche:\n${ficheJSON}\n\nREGLES: Detaille, pedagogique, exemples concrets, references legales, challenge. Utilise du markdown (## titres, **gras**, listes, tableaux) pour structurer tes reponses. Francais. Pas de JSON.`;
  try {
    const r = await callClaude(sys, chatMsgs.map(m => ({ role: m.role, content: m.content })), SONNET, 4000);
    chatMsgs.push({ role: 'assistant', content: r });
  } catch (e) { chatMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message }); }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

// 13. APPLY DISCUSSION CHANGES
async function _doApplyChanges() {
  if (!fiche || !selCat) return;
  if (chatMsgs.length < 1) { setStatus('Discute d\'abord'); return; }
  showLoading('Application des modifications...');
  const ficheJSON = smartTruncateFiche(JSON.stringify(fiche), 15000);
  const discussion = chatMsgs.map(m => (m.role === 'user' ? 'USER' : 'EXPERT') + ': ' + m.content).join('\n\n').slice(0, 8000);
  const sys = 'Expert pedagogique. APPLIQUE les modifications discutees. JSON complet sans backticks. Champs requis: metadata (title,category,version,verified,verificationNotes,sources), base.sections (array non vide), enrichments, quiz. Accents francais. CONSERVE existants. Incremente version.';
  try {
    const r = await callClaude(sys, 'FICHE:\n' + ficheJSON + '\n\nDISCUSSION:\n' + discussion, SONNET, 8000);
    const p = parseJ(r);
    if (!p) { console.error('PARSE FAIL:', r.slice(0, 500)); chatMsgs.push({ role: 'assistant', content: '\u274c JSON invalide. F12.' }); hideLoading(); render(); return; }
    const errors = validateFicheJSON(p);
    if (errors.length) { chatMsgs.push({ role: 'assistant', content: '\u274c Validation: ' + errors.join(', ') }); hideLoading(); render(); return; }
    p.metadata.version = (fiche.metadata?.version || 1) + 1;
    const slug = fiche.metadata?.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'f';
    const ex = await ghGet('data/' + selCat.id + '/' + slug + '.json');
    await ghPut('data/' + selCat.id + '/' + slug + '.json', p, 'Discuss v' + p.metadata.version, ex?.sha);
    fiche = p;
    chatMsgs.push({ role: 'assistant', content: '\u2705 **Fiche v' + p.metadata.version + ' sauvegardee !** Clique sur Fiche pour voir.' });
    setStatus('v' + p.metadata.version + ' OK');
  } catch (e) { chatMsgs.push({ role: 'assistant', content: '\u274c ' + e.message }); }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
}
function applyDiscussionChanges() { requireToken(() => _doApplyChanges()); }
window.applyDiscussionChanges = applyDiscussionChanges;

// 14. IMPORT ANALYSIS (Sonnet)
doAnalysis = async function(text) {
  showLoading('Analyse IA du document...');
  impStep = 'discuss'; impMsgs = [];
  const catList = cats.map(c => c.id + ' (' + c.name + ')').join(', ');
  const sys = 'Assistant pedagogique expert patrimoine/finance/fiscalite. Analyse le document: identifie sujet, propose TITRE, suggere CATEGORIE parmi: ' + catList + ' (ou NOUVELLE: nom). Analyse points forts/erreurs/manques. Propose ameliorations. Pose 2-3 questions. Utilise du markdown (## titres, **gras**, listes) pour structurer. Francais. A la fin JSON: {"suggestedTitle":"","suggestedCategory":"","analysis":""}';
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

// 15. SAVE/ENRICH overlays
const _origSave = saveImportFiche;
saveImportFiche = async function() { if (!hasToken()) { requireToken(saveImportFiche); return; } showLoading('Structuration...'); await _origSave(); hideLoading(); };
const _origEnrich = enrichDoc;
enrichDoc = async function() { if (!hasToken()) { requireToken(enrichDoc); return; } showLoading('Analyse...'); await _origEnrich(); hideLoading(); };

// 16. RENDER OVERRIDES + MARKDOWN POST-PROCESSING
const _origRender = render;
render = function() {
  _origRender();
  const content = $('content');
  if (!content) return;

  // POST-RENDER: Convert AI messages from escaped text to rendered markdown
  if (typeof marked !== 'undefined') {
    // Discussion chat bubbles
    content.querySelectorAll('.msg-ai').forEach(el => {
      if (el.dataset.mdRendered) return;
      el.dataset.mdRendered = 'true';
      const raw = el.textContent;
      if (raw) {
        el.style.whiteSpace = 'normal';
        el.innerHTML = renderMd(raw);
      }
    });
    // Import discussion bubbles (same class)
    // Already handled above since they use .msg-ai too
  }

  // QUIZ: inject controls + error analysis
  if (currentView === 'quiz' && fiche) {
    const genBtn = content.querySelector('[onclick*="genQuiz"]');
    if (genBtn) {
      const controlRow = genBtn.parentElement;
      if (controlRow && !controlRow.dataset.patched) {
        controlRow.dataset.patched = 'true';
        genBtn.remove();
        const d = document.createElement('div');
        d.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto;flex-wrap:wrap';
        d.innerHTML = '<select id="q-count" onchange="qCount=+this.value" style="padding:6px 10px;border-radius:8px;background:#111122;border:1px solid #1a1a33;color:#e8e8f0;font-size:12px;font-family:inherit">' +
          [5,10,15,20,25].map(n => '<option value="'+n+'" '+(qCount===n?'selected':'')+'>'+n+' Q</option>').join('') +
          '</select><select id="q-level" onchange="qLevel=this.value" style="padding:6px 10px;border-radius:8px;background:#111122;border:1px solid #1a1a33;color:#e8e8f0;font-size:12px;font-family:inherit">' +
          '<option value="basique" '+(qLevel==='basique'?'selected':'')+'>Basique</option>' +
          '<option value="modere" '+(qLevel==='modere'?'selected':'')+'>Modere</option>' +
          '<option value="expert" '+(qLevel==='expert'?'selected':'')+'>Expert</option>' +
          '</select><button class="btn btn-pri" onclick="genQuiz()">\u{1F916} Generer</button>';
        controlRow.appendChild(d);
      }
    }

    // Error analysis section
    if (qRes && qType !== 'flashcard' && !content.dataset.analysisPatched) {
      content.dataset.analysisPatched = 'true';
      const container = content.querySelector('[style*="max-width:780px"]');
      if (!container) return;
      const hasErrors = qType === 'qcm' ? qRes.some(r => !r.ok) : qRes.some(r => r.score < 7);
      const aDiv = document.createElement('div');
      aDiv.style.cssText = 'margin-top:14px';

      if (!qAnalysis && hasErrors) {
        aDiv.innerHTML = '<div style="background:#111122;border:1px solid #f87171;border-radius:14px;padding:20px;text-align:center">' +
          '<p style="font-size:14px;font-weight:600;color:#f87171;margin-bottom:8px">\u{1F50D} Des erreurs detectees</p>' +
          '<p style="font-size:12px;color:#9999b0;margin-bottom:14px">L\'IA peut analyser tes erreurs et proposer des ameliorations</p>' +
          '<button class="btn" onclick="analyzeQuizErrors()" style="background:#f87171;color:#fff;padding:12px 24px;font-size:14px">Analyser mes erreurs et ameliorer la fiche</button></div>';
      } else if (!qAnalysis && !hasErrors) {
        aDiv.innerHTML = '<div style="background:#111122;border:1px solid #34d399;border-radius:14px;padding:20px;text-align:center">' +
          '<p style="font-size:14px;font-weight:600;color:#34d399">\u2705 Parfait ! Aucune erreur.</p></div>';
      } else if (qAnalysis) {
        // Render analysis with MARKDOWN
        let h = '<div style="background:#111122;border:1px solid #7B68EE;border-radius:14px;padding:20px;margin-bottom:14px">' +
          '<h4 style="font-size:14px;color:#7B68EE;margin-bottom:10px">\u{1F9E0} Analyse de tes erreurs</h4>' +
          '<div style="font-size:12.5px;color:#9999b0;line-height:1.7">' + renderMd(qAnalysis) + '</div></div>';

        if (qSuggestions?.improvements?.length) {
          h += '<div style="background:#111122;border:1px solid #fbbf24;border-radius:14px;padding:20px">' +
            '<h4 style="font-size:14px;color:#fbbf24;margin-bottom:10px">\u{1F4DD} Ameliorations proposees</h4>';
          qSuggestions.improvements.forEach(imp => {
            const typeIcon = { warning: '\u26a0', example: '\u{1F4A1}', concept: '\u{1F4D6}', keyPoint: '\u2192' };
            h += '<div style="padding:8px 0;border-bottom:1px solid #1a1a33;font-size:12px">' +
              '<span style="color:#fbbf24">' + (typeIcon[imp.type] || '\u2022') + ' ' + (imp.type || '').toUpperCase() + '</span>' +
              (imp.section ? ' <span style="color:#6b6b88">(' + esc(imp.section) + ')</span>' : '') +
              '<p style="color:#e8e8f0;margin-top:4px">' + esc(imp.content) + '</p>' +
              '<p style="color:#6b6b88;font-style:italic;font-size:11px;margin-top:2px">' + esc(imp.reason || '') + '</p></div>';
          });
          h += '<button class="btn btn-grn" onclick="applyQuizImprovements()" style="width:100%;padding:14px;font-size:14px;margin-top:14px">\u2713 Appliquer ces ameliorations</button></div>';
        }
        aDiv.innerHTML = h;
      }
      container.appendChild(aDiv);
    }
  }

  // DISCUSSION: Apply button
  if (currentView === 'discuss' && fiche) {
    const chatInput = content.querySelector('[id="chat-input"]');
    if (chatInput) {
      const inputRow = chatInput.parentElement;
      if (inputRow && !inputRow.dataset.patched) {
        inputRow.dataset.patched = 'true';
        const applyRow = document.createElement('div');
        applyRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-shrink:0';
        applyRow.innerHTML = '<button class="btn btn-grn" onclick="applyDiscussionChanges()" style="flex:1;padding:12px;font-size:13px"' + (chatMsgs.length < 1 ? ' disabled' : '') + '>\u2713 Appliquer les modifications</button>' +
          '<span style="display:flex;align-items:center;padding:0 8px;font-size:10px;color:#6b6b88">v' + (fiche.metadata?.version || 1) + '</span>';
        inputRow.parentElement.insertBefore(applyRow, inputRow.nextSibling);
      }
    }
  }
};

console.log('StudyForge v13: Markdown rendering in chat + quiz analysis');
