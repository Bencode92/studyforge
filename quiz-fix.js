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
