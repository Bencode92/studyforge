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
