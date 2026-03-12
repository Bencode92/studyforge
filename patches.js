// StudyForge Patches v9 - UTF-8 + Haiku quiz + Sonnet discussion + Apply changes

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

callClaude = async function(sys, msgs, model, maxTok) {
  const body = { model: model || SONNET, max_tokens: maxTok || 4000, system: sys };
  body.messages = Array.isArray(msgs) ? msgs : [{ role: 'user', content: msgs }];
  const r = await fetch(PROXY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'API error');
  return d.content?.[0]?.text || '';
};

// 3. QUIZ STATE
let qCount = 10;
let qLevel = 'modere';

// 4. LOADING OVERLAY
const overlay = document.createElement('div');
overlay.id = 'loading-overlay';
overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(6,6,16,0.85);display:none;align-items:center;justify-content:center;z-index:1000;flex-direction:column;gap:16px';
overlay.innerHTML = '<div style="width:40px;height:40px;border:3px solid #7B68EE;border-top-color:transparent;border-radius:50%;animation:spin .7s linear infinite"></div><p id="loading-text" style="color:#a29bfe;font-size:15px;font-weight:600;font-family:Outfit,sans-serif">Chargement...</p><p style="color:#6b6b88;font-size:11px;font-family:Outfit,sans-serif">Powered by Claude AI</p>';
document.body.appendChild(overlay);
function showLoading(t) { document.getElementById('loading-text').textContent = t || 'Chargement...'; overlay.style.display = 'flex'; }
function hideLoading() { overlay.style.display = 'none'; }

// 5. QUIZ (Haiku)
genQuiz = async function() {
  if (!fiche) return;
  showLoading('Generation de ' + qCount + ' questions (' + qLevel + ')...');
  qRes = null; qAns = {}; qFlip = {};
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

// 6. CORRECTION (Haiku)
correctQuiz = async function() {
  if (!quiz) return; showLoading('Correction...');
  if (qType === 'qcm') { qRes = quiz.map(q => ({ ...q, ua: qAns[q.id], ok: qAns[q.id] === q.correct })); hideLoading(); render(); return; }
  const txt = quiz.map(q => 'Q: ' + q.question + '\nR: ' + (qAns[q.id] || '(vide)')).join('\n\n');
  try {
    const r = await callClaude('Corrige. JSON sans backticks: [{"id":1,"score":0,"feedback":"","missingPoints":[""],"suggestion":""}]', txt + '\nAttendus: ' + JSON.stringify(quiz.map(q => ({ id: q.id, pts: q.expectedPoints }))), HAIKU);
    const p = parseJ(r); if (p) qRes = p;
  } catch (e) { setStatus('Erreur: ' + e.message); }
  hideLoading(); render();
};

// 7. DISCUSSION - SONNET, deeper, with apply changes
sendMsg = async function() {
  const msg = $('chat-input')?.value?.trim();
  if (!msg || !fiche) return;
  $('chat-input').value = '';
  chatMsgs.push({ role: 'user', content: msg }); render();
  showLoading('Reflexion approfondie...');

  const ficheJSON = JSON.stringify(fiche, null, 0);
  const sys = `Tu es un tuteur expert en gestion de patrimoine, fiscalite et finance. Tu discutes avec l'utilisateur a propos de cette fiche de cours.

FICHE COMPLETE:
${ficheJSON.slice(0, 8000)}

REGLES:
- Reponds de maniere DETAILLEE et PEDAGOGIQUE (pas de reponses courtes)
- Developpe tes explications avec des exemples concrets, des cas pratiques, des chiffres
- Challenge les idees de l'utilisateur, propose des angles differents
- Si l'utilisateur demande des modifications, explique ce que tu changerais et pourquoi
- Corrige les erreurs avec des references legales precises (articles du CGI, Code civil, etc.)
- Propose des ameliorations proactives quand tu vois des manques
- Francais, ton professionnel mais accessible

IMPORTANT: Ne mets PAS de JSON dans ta reponse. Reponds naturellement en texte.`;

  try {
    const r = await callClaude(sys, chatMsgs.map(m => ({ role: m.role, content: m.content })), SONNET, 4000);
    chatMsgs.push({ role: 'assistant', content: r });
  } catch (e) { chatMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message }); }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
};

// 8. APPLY DISCUSSION CHANGES TO FICHE
async function applyDiscussionChanges() {
  if (!fiche || !selCat || !hasToken() || chatMsgs.length < 2) {
    setStatus('Discute d\'abord avec l\'IA avant d\'appliquer');
    return;
  }
  showLoading('Application des modifications a la fiche...');

  const ficheJSON = JSON.stringify(fiche);
  const discussion = chatMsgs.map(m => (m.role === 'user' ? 'UTILISATEUR' : 'EXPERT') + ': ' + m.content).join('\n\n');

  const sys = `Tu es un expert pedagogique. L'utilisateur a discute avec toi d'une fiche de cours. Tu dois maintenant APPLIQUER toutes les modifications, corrections et ameliorations discutees a la fiche.

REGLES:
- Reprends la fiche existante et INTEGRE toutes les modifications demandees dans la discussion
- Corrige les erreurs signalees
- Ajoute les precisions et exemples discutes
- Ameliore le contenu selon les echanges
- Incremente la version de +1
- Ajoute une note de verification resumant les changements
- Ajoute un enrichissement de type "discussion" resumant ce qui a change
- Conserve les enrichissements et quiz existants
- Reponds UNIQUEMENT avec le JSON complet de la fiche mise a jour, sans backticks`;

  try {
    const r = await callClaude(sys, 'FICHE ACTUELLE:\n' + ficheJSON.slice(0, 10000) + '\n\nDISCUSSION:\n' + discussion.slice(0, 4000), SONNET, 8000);
    const p = parseJ(r);
    if (p) {
      // Ensure version increment
      if (p.metadata) p.metadata.version = (fiche.metadata?.version || 1) + 1;
      
      const slug = fiche.metadata?.title?.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'f';
      const ex = await ghGet('data/' + selCat.id + '/' + slug + '.json');
      await ghPut('data/' + selCat.id + '/' + slug + '.json', p, 'Discussion update v' + (p.metadata?.version || 2), ex?.sha);
      fiche = p;
      ficheSha = null;
      chatMsgs.push({ role: 'assistant', content: '✅ Fiche mise a jour et pushee sur GitHub !\n\nChangements appliques (v' + (p.metadata?.version || 2) + '). Retourne sur l\'onglet Fiche pour voir le resultat.' });
      setStatus('Fiche mise a jour !');
    } else {
      chatMsgs.push({ role: 'assistant', content: 'Erreur: l\'IA n\'a pas pu generer le JSON. Reessaie ou reformule ta demande.' });
      setStatus('Erreur structuration');
    }
  } catch (e) {
    chatMsgs.push({ role: 'assistant', content: 'Erreur: ' + e.message });
    setStatus('Erreur: ' + e.message);
  }
  hideLoading(); render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
}
// Make it global
window.applyDiscussionChanges = applyDiscussionChanges;

// 9. IMPORT ANALYSIS (Sonnet)
doAnalysis = async function(text) {
  showLoading('Analyse IA du document...');
  impStep = 'discuss'; impMsgs = [];
  const catList = cats.map(c => c.id + ' (' + c.name + ')').join(', ');
  const sys = 'Tu es un assistant pedagogique expert en gestion de patrimoine, finance et fiscalite. L\'utilisateur t\'envoie le contenu brut d\'un document. Tu dois:\n1. IDENTIFIER le sujet\n2. Proposer un TITRE\n3. SUGGERER la CATEGORIE parmi: ' + catList + '. Si aucune ne colle: "NOUVELLE: nom"\n4. ANALYSER: points forts, erreurs, manques, references legales\n5. PROPOSER des ameliorations\n6. POSER 2-3 questions\n\nSois DETAILLE et pedagogique. Francais.\nA la fin, JSON: {"suggestedTitle":"","suggestedCategory":"","analysis":""}';
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

// 10. SAVE + ENRICH overlays
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

// 11. RENDER OVERRIDES
const _origRender = render;
render = function() {
  _origRender();
  const content = $('content');
  if (!content) return;

  // QUIZ: inject count + level selectors
  if (currentView === 'quiz' && fiche) {
    const genBtn = content.querySelector('[onclick*="genQuiz"]');
    if (!genBtn) return;
    const controlRow = genBtn.parentElement;
    if (!controlRow || controlRow.dataset.patched) return;
    controlRow.dataset.patched = 'true';
    genBtn.remove();
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;align-items:center;gap:6px;margin-left:auto';
    d.innerHTML = '<select id="q-count" onchange="qCount=+this.value" style="padding:6px 10px;border-radius:8px;background:#111122;border:1px solid #1a1a33;color:#e8e8f0;font-size:12px;font-family:inherit">' +
      [5,10,15,20,25].map(n => '<option value="'+n+'" '+(qCount===n?'selected':'')+'>'+n+' Q</option>').join('') +
      '</select><select id="q-level" onchange="qLevel=this.value" style="padding:6px 10px;border-radius:8px;background:#111122;border:1px solid #1a1a33;color:#e8e8f0;font-size:12px;font-family:inherit">' +
      '<option value="basique" '+(qLevel==='basique'?'selected':'')+'>Basique</option>' +
      '<option value="modere" '+(qLevel==='modere'?'selected':'')+'>Modere</option>' +
      '<option value="expert" '+(qLevel==='expert'?'selected':'')+'>Expert</option>' +
      '</select><button class="btn btn-pri" onclick="genQuiz()">&#x1F916; Generer</button>';
    controlRow.appendChild(d);
  }

  // DISCUSSION: inject "Apply changes" button
  if (currentView === 'discuss' && fiche) {
    const chatInput = content.querySelector('[id="chat-input"]');
    if (!chatInput) return;
    const inputRow = chatInput.parentElement;
    if (!inputRow || inputRow.dataset.patched) return;
    inputRow.dataset.patched = 'true';

    // Add apply button row after input
    const applyRow = document.createElement('div');
    applyRow.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-shrink:0';
    applyRow.innerHTML = '<button class="btn btn-grn" onclick="applyDiscussionChanges()" style="flex:1;padding:12px;font-size:13px" ' + (chatMsgs.length < 2 ? 'disabled' : '') + '>&#x2713; Appliquer les modifications a la fiche</button>' +
      '<div style="flex:0;display:flex;align-items:center;padding:0 8px"><span style="font-size:10px;color:#6b6b88">v' + (fiche.metadata?.version || 1) + '</span></div>';
    inputRow.parentElement.insertBefore(applyRow, inputRow.nextSibling);
  }
};

console.log('StudyForge v9: Discussion Sonnet + Apply changes + Quiz custom');