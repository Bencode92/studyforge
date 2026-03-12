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
