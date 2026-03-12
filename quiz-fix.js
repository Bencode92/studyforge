// StudyForge v14.2 - Fix: quiz generates balanced mix of theory + practice
// Problem: Expert mode generated ONLY calculation/case questions, zero definitions
// Fix: explicit mix instructions in prompt per level

genQuiz = async function() {
  if (!fiche) return;
  showLoading('Generation de ' + qCount + ' questions (' + qLevel + ')...');
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

  // BALANCED MIX per level - the key fix
  const levels = {
    basique: 'BASIQUE - Repartition: 70% definitions et memorisation (vocabulaire, seuils, articles de loi, mecanismes de base, distinctions simples), 30% application simple.',
    modere: 'MODERE - Repartition: 40% definitions et theorie (termes precis, references legales, distinctions entre concepts), 40% application et cas pratiques, 20% pieges et subtilites.',
    expert: 'EXPERT - Repartition: 30% theorie avancee (definitions precises, articles de loi, exceptions legales, distinctions subtiles entre regimes), 40% cas pratiques complexes avec calculs, 30% pieges et articulations entre concepts. ATTENTION: ne genere PAS uniquement des calculs, inclus AUSSI des questions de theorie pure et de definition.'
  };

  const maxTok = qCount <= 10 ? 4000 : qCount <= 15 ? 6000 : 8000;

  const mixRule = 'REGLE ABSOLUE: varie les types de questions. Alterne entre (1) questions de DEFINITION: "Qu\'est-ce que X?", "Quel article regit Y?", "Quelle est la difference entre A et B?", "Quel est le plafond de X?" ; (2) questions d\'APPLICATION: "Calculez...", "Quel est l\'impact fiscal de..."; (3) questions de PIEGE: "Vrai ou faux: ...", "Ne confondez pas X et Y". NE FAIS PAS que des cas pratiques ou que des calculs.';

  const pr = {
    qcm: 'Genere exactement ' + qCount + ' QCM. ' + levels[qLevel] + ' ' + mixRule + (wp ? ' Points faibles (insiste dessus): ' + wp : '') + '. Reponds UNIQUEMENT avec un JSON array valide, sans backticks, sans texte: [{"id":1,"question":"","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":""}]',
    open: 'Genere exactement ' + qCount + ' questions ouvertes. ' + levels[qLevel] + ' ' + mixRule + '. Reponds UNIQUEMENT avec un JSON array valide, sans backticks, sans texte: [{"id":1,"question":"","expectedPoints":["","",""],"difficulty":"' + qLevel + '","hint":""}]',
    flashcard: 'Genere exactement ' + qCount + ' flashcards. ' + levels[qLevel] + ' ' + mixRule + '. Pour les flashcards de DEFINITION: recto = terme ou concept, verso = definition precise + reference legale si applicable. Pour les flashcards d\'APPLICATION: recto = situation, verso = reponse detaillee. Reponds UNIQUEMENT avec un JSON array valide, sans backticks, sans texte: [{"id":1,"front":"","back":""}]'
  };

  try {
    const r = await callClaude(
      'Tu generes des quiz pedagogiques sur le patrimoine et la fiscalite francaise. Reponds UNIQUEMENT avec du JSON valide, sans backticks, sans texte avant ou apres. EXACTEMENT ' + qCount + ' elements. IMPERATIF: varie les types — definitions, theorie de cours, cas pratiques, calculs, pieges. Jamais 100% du meme type.',
      pr[qType] + '\n\nCONTENU DE LA FICHE:\n' + ctx.slice(0, 8000) + (en ? '\n\nENRICHISSEMENTS: ' + en.slice(0, 1000) : ''),
      HAIKU,
      maxTok
    );
    const p = parseJ(r);
    if (p && Array.isArray(p)) {
      quiz = p;
      showToast(p.length + ' questions generees !');
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

console.log('v14.2: Quiz balanced mix - theory + definitions + practice + traps');
