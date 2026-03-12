// StudyForge v14.1 - Fix quiz generation for large fiches

// Find and replace genQuiz in the existing patches.js
// The issue: JSON.stringify(fiche.base.sections) sends full 14KB+ content to Haiku
// Fix: summarize sections for quiz context, increase max_tokens, add error logging

// This file is loaded AFTER patches.js to override genQuiz only
const _v14GenQuiz = genQuiz;

genQuiz = async function() {
  if (!fiche) return;
  showLoading('Generation de ' + qCount + ' questions (' + qLevel + ')...');
  qRes = null; qAns = {}; qFlip = {}; qAnalysis = null; qSuggestions = null;

  // SMART CONTEXT: summarize sections instead of dumping raw JSON
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
  
  const levels = {
    basique: 'BASIQUE: memorisation, definitions. Pas de pieges.',
    modere: 'MODERE: application, comprehension, subtilites.',
    expert: 'EXPERT: cas pratiques complexes, pieges, calculs, articulations entre concepts.'
  };

  // Adjust max_tokens based on question count
  const maxTok = qCount <= 10 ? 4000 : qCount <= 15 ? 6000 : 8000;

  const pr = {
    qcm: 'Genere exactement ' + qCount + ' QCM. Niveau ' + levels[qLevel] + (wp ? ' Points faibles (insiste dessus): ' + wp : '') + '. Reponds UNIQUEMENT avec un JSON array sans backticks: [{"id":1,"question":"","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":""}]',
    open: 'Genere exactement ' + qCount + ' questions ouvertes. Niveau ' + levels[qLevel] + '. Reponds UNIQUEMENT avec un JSON array sans backticks: [{"id":1,"question":"","expectedPoints":["","",""],"difficulty":"' + qLevel + '","hint":""}]',
    flashcard: 'Genere exactement ' + qCount + ' flashcards. Niveau ' + levels[qLevel] + '. Reponds UNIQUEMENT avec un JSON array sans backticks: [{"id":1,"front":"","back":""}]'
  };

  try {
    const r = await callClaude(
      'Tu generes des quiz pedagogiques sur le patrimoine et la fiscalite. Tu reponds UNIQUEMENT avec du JSON valide, sans backticks, sans texte avant ou apres. EXACTEMENT ' + qCount + ' elements dans l\'array.',
      pr[qType] + '\n\nCONTENU DE LA FICHE:\n' + ctx.slice(0, 8000) + (en ? '\n\nENRICHISSEMENTS: ' + en.slice(0, 1000) : ''),
      HAIKU,
      maxTok
    );
    const p = parseJ(r);
    if (p && Array.isArray(p)) {
      quiz = p;
      showToast(p.length + ' questions generees !');
    } else {
      console.error('Quiz parseJ failed. Response (500 chars):', r.slice(0, 500));
      showToast('Erreur: reponse IA invalide. Reessaie.', true);
      setStatus('Erreur parse', true);
    }
  } catch (e) {
    console.error('Quiz gen error:', e);
    showToast('Erreur: ' + e.message, true);
    setStatus('Erreur: ' + e.message);
  }
  hideLoading(); render();
};

console.log('v14.1: Quiz gen fix for large fiches loaded');
