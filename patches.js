// StudyForge Patches v7 - UTF-8 fix + Haiku for cheap tasks + loading overlay

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

// 2. HAIKU FOR CHEAP TASKS (quiz, discussion, correction)
const SONNET = 'claude-sonnet-4-20250514';
const HAIKU = 'claude-haiku-4-5-20251001';
const _origCallClaude = callClaude;

callClaude = async function(sys, msgs, model) {
  const m = model || SONNET;
  const body = { model: m, max_tokens: 4000, system: sys };
  body.messages = Array.isArray(msgs) ? msgs : [{ role: 'user', content: msgs }];
  const r = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  return d.content?.[0]?.text || '';
};

// Override quiz gen to use Haiku
const _origGenQuiz = genQuiz;
genQuiz = async function() {
  if (!fiche) return;
  showLoading('Generation du quiz...');
  qRes = null; qAns = {}; qFlip = {};
  const ct = JSON.stringify(fiche.base?.sections || []);
  const en = (fiche.enrichments || []).map(e => (e.addedPoints || []).join(', ')).join(' | ');
  const wp = (fiche.quiz?.weakPoints || []).join(', ');
  const pr = {
    qcm: 'Genere 6 QCM varies et exigeants. Insiste sur points faibles: ' + wp + '. JSON sans backticks: [{"id":1,"question":"","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":"explication detaillee"}]',
    open: 'Genere 4 questions ouvertes. JSON sans backticks: [{"id":1,"question":"","expectedPoints":["","",""],"difficulty":"medium","hint":""}]',
    flashcard: 'Genere 10 flashcards. JSON sans backticks: [{"id":1,"front":"","back":""}]'
  };
  try {
    const r = await callClaude('Quiz pedagogique patrimoine/fiscalite. JSON sans backticks uniquement.', pr[qType] + '\nFiche:\n' + ct + '\nEnrichissements:\n' + en, HAIKU);
    const p = parseJ(r);
    if (p) { quiz = p; } else setStatus('Erreur gen.');
  } catch (e) { setStatus('Erreur: ' + e.message); }
  hideLoading(); render();
};

// Override correction to use Haiku
const _origCorrectQuiz = correctQuiz;
correctQuiz = async function() {
  if (!quiz) return;
  showLoading('Correction...');
  if (qType === 'qcm') { qRes = quiz.map(q => ({ ...q, ua: qAns[q.id], ok: qAns[q.id] === q.correct })); hideLoading(); render(); return; }
  const txt = quiz.map(q => 'Q: ' + q.question + '\nR: ' + (qAns[q.id] || '(vide)')).join('\n\n');
  try {
    const r = await callClaude('Corrige pedagogiquement. JSON sans backticks: [{"id":1,"score":0,"feedback":"","missingPoints":[""],"suggestion":""}]', txt + '\nAttendus: ' + JSON.stringify(quiz.map(q => ({ id: q.id, pts: q.expectedPoints }))), HAIKU);
    const p = parseJ(r); if (p) qRes = p;
  } catch (e) { setStatus('Erreur: ' + e.message); }
  hideLoading(); render();
};

// Override discussion to use Haiku
const _origSendMsg = sendMsg;
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

// 3. LOADING OVERLAY
const overlay = document.createElement('div');
overlay.id = 'loading-overlay';
overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(6,6,16,0.85);display:none;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:16px';
overlay.innerHTML = '<div style="width:40px;height:40px;border:3px solid #7B68EE;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div><p id="loading-text" style="color:#a29bfe;font-size:15px;font-weight:600;font-family:Outfit,sans-serif">Chargement...</p><p style="color:#6b6b88;font-size:11px;font-family:Outfit,sans-serif">Powered by Claude AI</p>';
document.body.appendChild(overlay);

function showLoading(text) {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = text || 'Chargement...';
  overlay.style.display = 'flex';
}
function hideLoading() { overlay.style.display = 'none'; }

// Override import analysis to show overlay
const _origDoAnalysis = doAnalysis;
doAnalysis = async function(text) {
  showLoading('Analyse IA du document...');
  impStep = 'discuss'; impMsgs = [];
  const catList = cats.map(c => c.id + ' (' + c.name + ')').join(', ');
  const sys = 'Tu es un assistant pedagogique expert en gestion de patrimoine, finance et fiscalite. L\'utilisateur t\'envoie le contenu brut d\'un document (PDF ou texte). Tu dois:\n\n1. IDENTIFIER le sujet principal\n2. Proposer un TITRE clair et precis\n3. SUGGERER la CATEGORIE parmi: ' + catList + '. Si aucune ne colle, propose "NOUVELLE: nom_categorie"\n4. ANALYSER le contenu:\n   - Points forts du document\n   - Erreurs ou imprecisions detectees\n   - Informations manquantes ou a completer\n   - References legales a verifier\n5. PROPOSER des ameliorations concretes\n6. POSER 2-3 questions a l\'utilisateur pour affiner la fiche\n\nSois conversationnel, precis et pedagogique. Francais.\n\nA la fin, ajoute sur une ligne separee ce JSON:\n{"suggestedTitle":"titre propose","suggestedCategory":"id_categorie_existante ou NOUVELLE: nom","analysis":"resume 1 phrase"}\n\nNe structure PAS la fiche en JSON complet maintenant, on discute d\'abord.';
  try {
    render();
    const r = await callClaude(sys, 'Voici le contenu a analyser:\n\n' + text.slice(0, 14000), SONNET);
    let display = r, meta = null;
    const jm = r.match(/\{"suggestedTitle"[\s\S]*?\}/);
    if (jm) { meta = parseJ(jm[0]); display = r.replace(jm[0], '').trim(); }
    impMsgs.push({ role: 'assistant', content: display, meta: meta });
  } catch (e) {
    impMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message });
  }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

// Override save to show overlay
const _origSaveImport = saveImportFiche;
saveImportFiche = async function() {
  if (!hasToken()) { requireToken(saveImportFiche); return; }
  showLoading('Structuration et sauvegarde...');
  await _origSaveImport();
  hideLoading();
};

// Override enrichDoc to show overlay
const _origEnrichDoc = enrichDoc;
enrichDoc = async function() {
  if (!hasToken()) { requireToken(enrichDoc); return; }
  showLoading('Analyse du document...');
  await _origEnrichDoc();
  hideLoading();
};

console.log('StudyForge v7 patches loaded: UTF-8 fix + Haiku + Loading overlay');