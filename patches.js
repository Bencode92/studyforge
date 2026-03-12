// StudyForge Patches v8 - UTF-8 + Haiku + Loading + Quiz customization

// 1. FIX UTF-8 ACCENTS
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

callClaude = async function(sys, msgs, model) {
  const m = model || SONNET;
  const body = { model: m, max_tokens: 4000, system: sys };
  body.messages = Array.isArray(msgs) ? msgs : [{ role: 'user', content: msgs }];
  const r = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  return d.content?.[0]?.text || '';
};

// 3. QUIZ CUSTOMIZATION STATE
let qCount = 10;
let qLevel = 'modere';

// 4. LOADING OVERLAY
const overlay = document.createElement('div');
overlay.id = 'loading-overlay';
overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(6,6,16,0.85);display:none;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:16px';
overlay.innerHTML = '<div style="width:40px;height:40px;border:3px solid #7B68EE;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div><p id="loading-text" style="color:#a29bfe;font-size:15px;font-weight:600;font-family:Outfit,sans-serif">Chargement...</p><p style="color:#6b6b88;font-size:11px;font-family:Outfit,sans-serif">Powered by Claude AI</p>';
document.body.appendChild(overlay);

function showLoading(text) {
  document.getElementById('loading-text').textContent = text || 'Chargement...';
  overlay.style.display = 'flex';
}
function hideLoading() { overlay.style.display = 'none'; }

// 5. QUIZ GEN with count + level
genQuiz = async function() {
  if (!fiche) return;
  showLoading('Generation de ' + qCount + ' questions (' + qLevel + ')...');
  qRes = null; qAns = {}; qFlip = {};
  const ct = JSON.stringify(fiche.base?.sections || []);
  const en = (fiche.enrichments || []).map(e => (e.addedPoints || []).join(', ')).join(' | ');
  const wp = (fiche.quiz?.weakPoints || []).join(', ');

  const levels = {
    basique: 'Niveau BASIQUE: questions simples de memorisation et definitions. Pas de pieges. Reponses evidentes pour quelqu\'un qui a lu la fiche.',
    modere: 'Niveau MODERE: questions d\'application et comprehension. Quelques subtilites. Il faut avoir bien compris la fiche pour repondre.',
    expert: 'Niveau EXPERT: questions pointues, cas pratiques complexes, pieges courants, calculs, articulations entre concepts. Seul quelqu\'un qui maitrise parfaitement le sujet peut repondre.'
  };

  const levelInstr = levels[qLevel] || levels.modere;

  const pr = {
    qcm: 'Genere exactement ' + qCount + ' QCM. ' + levelInstr + ' Insiste sur points faibles: ' + wp + '. JSON sans backticks: [{"id":1,"question":"","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":"explication detaillee"}]',
    open: 'Genere exactement ' + qCount + ' questions ouvertes. ' + levelInstr + ' JSON sans backticks: [{"id":1,"question":"","expectedPoints":["","",""],"difficulty":"' + qLevel + '","hint":""}]',
    flashcard: 'Genere exactement ' + qCount + ' flashcards. ' + levelInstr + ' JSON sans backticks: [{"id":1,"front":"question ou terme","back":"reponse complete"}]'
  };

  try {
    const r = await callClaude('Quiz pedagogique patrimoine/fiscalite. JSON sans backticks uniquement. Genere EXACTEMENT ' + qCount + ' elements.', pr[qType] + '\nFiche:\n' + ct + '\nEnrichissements:\n' + en, HAIKU);
    const p = parseJ(r);
    if (p) { quiz = p; } else setStatus('Erreur generation.');
  } catch (e) { setStatus('Erreur: ' + e.message); }
  hideLoading(); render();
};

// 6. CORRECTION with Haiku
correctQuiz = async function() {
  if (!quiz) return;
  showLoading('Correction en cours...');
  if (qType === 'qcm') {
    qRes = quiz.map(q => ({ ...q, ua: qAns[q.id], ok: qAns[q.id] === q.correct }));
    hideLoading(); render(); return;
  }
  const txt = quiz.map(q => 'Q: ' + q.question + '\nR: ' + (qAns[q.id] || '(vide)')).join('\n\n');
  try {
    const r = await callClaude('Corrige pedagogiquement. JSON sans backticks: [{"id":1,"score":0,"feedback":"","missingPoints":[""],"suggestion":""}]', txt + '\nAttendus: ' + JSON.stringify(quiz.map(q => ({ id: q.id, pts: q.expectedPoints }))), HAIKU);
    const p = parseJ(r); if (p) qRes = p;
  } catch (e) { setStatus('Erreur: ' + e.message); }
  hideLoading(); render();
};

// 7. DISCUSSION with Haiku
sendMsg = async function() {
  const msg = $('chat-input')?.value?.trim();
  if (!msg || !fiche) return;
  $('chat-input').value = '';
  chatMsgs.push({ role: 'user', content: msg }); render();
  showLoading('Reflexion...');
  const ctx = JSON.stringify((fiche.base?.sections || []).map(s => ({ title: s.title, concepts: s.concepts, keyPoints: s.keyPoints })));
  const enCtx = (fiche.enrichments || []).map(e => (e.addedPoints || []).join(', ')).join(' | ');
  const sys = 'Tuteur expert patrimoine/fiscalite/finance. Fiche: ' + ctx + ' Enrichissements: ' + enCtx + ' Regles: reponds pedagogiquement, challenge, corrige. Si point important: termine avec {"addToFiche":"le point cle"}. Francais.';
  try {
    const r = await callClaude(sys, chatMsgs.map(m => ({ role: m.role, content: m.content })), HAIKU);
    let text = r, note = null;
    const jm = r.match(/\{"addToFiche"\s*:\s*"([^"]+)"\}/);
    if (jm) { note = jm[1]; text = r.replace(jm[0], '').trim(); }
    const am = { role: 'assistant', content: text }; if (note) am.note = note;
    chatMsgs.push(am);
    if (note && fiche && selCat && hasToken()) {
      const u = JSON.parse(JSON.stringify(fiche));
      if (!u.enrichments) u.enrichments = [];
      u.enrichments.push({ id: 'enr-d-' + Date.now(), date: new Date().toISOString().split('T')[0], source: { type: 'discussion' }, trigger: 'discussion', summary: note, addedPoints: [note] });
      const slug = fiche.metadata?.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'f';
      const ex = await ghGet('data/' + selCat.id + '/' + slug + '.json');
      await ghPut('data/' + selCat.id + '/' + slug + '.json', u, 'Discuss enrich', ex?.sha);
      fiche = u;
    }
  } catch (e) { chatMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message }); }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

// 8. IMPORT ANALYSIS with overlay
doAnalysis = async function(text) {
  showLoading('Analyse IA du document...');
  impStep = 'discuss'; impMsgs = [];
  const catList = cats.map(c => c.id + ' (' + c.name + ')').join(', ');
  const sys = 'Tu es un assistant pedagogique expert en gestion de patrimoine, finance et fiscalite. L\'utilisateur t\'envoie le contenu brut d\'un document. Tu dois:\n1. IDENTIFIER le sujet principal\n2. Proposer un TITRE clair\n3. SUGGERER la CATEGORIE parmi: ' + catList + '. Si aucune ne colle, propose "NOUVELLE: nom"\n4. ANALYSER: points forts, erreurs, manques, references legales\n5. PROPOSER des ameliorations\n6. POSER 2-3 questions\n\nConversationnel, precis, pedagogique. Francais.\nA la fin, JSON sur une ligne: {"suggestedTitle":"","suggestedCategory":"","analysis":""}';
  try {
    render();
    const r = await callClaude(sys, 'Contenu a analyser:\n\n' + text.slice(0, 14000), SONNET);
    let display = r, meta = null;
    const jm = r.match(/\{"suggestedTitle"[\s\S]*?\}/);
    if (jm) { meta = parseJ(jm[0]); display = r.replace(jm[0], '').trim(); }
    impMsgs.push({ role: 'assistant', content: display, meta: meta });
  } catch (e) { impMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message }); }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

// 9. SAVE + ENRICH with overlay
const _origSave = saveImportFiche;
saveImportFiche = async function() {
  if (!hasToken()) { requireToken(saveImportFiche); return; }
  showLoading('Structuration et sauvegarde...');
  await _origSave();
  hideLoading();
};

const _origEnrich = enrichDoc;
enrichDoc = async function() {
  if (!hasToken()) { requireToken(enrichDoc); return; }
  showLoading('Analyse du document...');
  await _origEnrich();
  hideLoading();
};

// 10. OVERRIDE RENDER for quiz section with custom controls
const _origRender = render;
render = function() {
  _origRender();

  // After render, inject quiz controls if on quiz view
  if (currentView === 'quiz' && fiche) {
    const content = $('content');
    if (!content) return;

    // Find the quiz header area and inject controls after the type buttons
    const genBtn = content.querySelector('[onclick*="genQuiz"]');
    if (!genBtn) return;
    const controlRow = genBtn.parentElement;
    if (!controlRow || controlRow.dataset.patched) return;
    controlRow.dataset.patched = 'true';

    // Remove old genBtn
    genBtn.remove();

    // Add count selector
    const countDiv = document.createElement('div');
    countDiv.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto';
    countDiv.innerHTML = `
      <select id="q-count" onchange="qCount=+this.value" style="padding:6px 10px;border-radius:8px;background:#111122;border:1px solid #1a1a33;color:#e8e8f0;font-size:12px;font-family:inherit">
        <option value="5" ${qCount===5?'selected':''}>5 questions</option>
        <option value="10" ${qCount===10?'selected':''}>10 questions</option>
        <option value="15" ${qCount===15?'selected':''}>15 questions</option>
        <option value="20" ${qCount===20?'selected':''}>20 questions</option>
        <option value="25" ${qCount===25?'selected':''}>25 questions</option>
      </select>
      <select id="q-level" onchange="qLevel=this.value" style="padding:6px 10px;border-radius:8px;background:#111122;border:1px solid #1a1a33;color:#e8e8f0;font-size:12px;font-family:inherit">
        <option value="basique" ${qLevel==='basique'?'selected':''}>Basique</option>
        <option value="modere" ${qLevel==='modere'?'selected':''}>Modere</option>
        <option value="expert" ${qLevel==='expert'?'selected':''}>Expert</option>
      </select>
      <button class="btn btn-pri" onclick="genQuiz()">&#x1F916; Generer</button>
    `;
    controlRow.appendChild(countDiv);
  }
};

console.log('StudyForge v8: UTF-8 + Haiku + Loading + Quiz count/level');