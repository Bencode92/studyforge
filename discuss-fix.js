// StudyForge v16.2 - Fix: "Appliquer les modifications" for large fiches
// Problem: Sonnet had to reproduce the ENTIRE fiche JSON (14KB+) → output truncated → parseJ fails
// Fix: 2-step approach - Step 1: IA lists changes as operations, Step 2: apply locally
// Same pattern as quiz improvements - much more reliable

async function _doApplyChanges() {
  if (!fiche || !selCat || !ficheSlug) return;
  if (chatMsgs.length < 1) { showToast('Discute d\'abord', true); return; }

  showLoading('Extraction des modifications...');

  // Summarize the discussion - only send last 6000 chars to leave room
  const disc = chatMsgs
    .map(m => (m.role === 'user' ? 'USER' : 'EXPERT') + ': ' + m.content)
    .join('\n\n');
  const discTrunc = disc.length > 6000 
    ? disc.slice(0, 3000) + '\n\n[...]\n\n' + disc.slice(-3000) 
    : disc;

  // Send fiche structure (titles + key points only, not full content)
  const ficheStructure = (fiche.base?.sections || []).map((s, i) => 
    'Section ' + i + ': "' + s.title + '" (' + (s.keyPoints?.length || 0) + ' keyPoints, ' + 
    (s.warnings?.length || 0) + ' warnings, ' + (s.concepts?.length || 0) + ' concepts, ' + 
    (s.examples?.length || 0) + ' examples)'
  ).join('\n');

  // STEP 1: Ask IA to list the changes as structured operations
  try {
    const sysSt1 = 'Tu es un expert pedagogique. L\'utilisateur a discute avec un tuteur IA. ' +
      'Analyse la discussion et LISTE toutes les modifications a appliquer a la fiche de cours. ' +
      'Reponds UNIQUEMENT avec un JSON valide, sans backticks:\n' +
      '{"changes":[{"action":"add_warning|add_example|add_keyPoint|add_concept|update_content|add_section",' +
      '"section":"titre exact de la section cible (ou nouveau titre si add_section)",' +
      '"content":"le texte a ajouter ou le nouveau contenu",' +
      '"reason":"pourquoi ce changement"}],' +
      '"summary":"resume en 1 phrase des changements",' +
      '"verificationNote":"ce qui a ete verifie/corrige"}';

    const r = await callClaude(
      sysSt1,
      'STRUCTURE DE LA FICHE "' + (fiche.metadata?.title || '') + '":\n' + ficheStructure + 
      '\n\nDISCUSSION COMPLETE:\n' + discTrunc,
      SONNET,
      4000
    );

    const changes = parseJ(r);
    if (!changes || !changes.changes?.length) {
      console.error('No changes extracted:', r.slice(0, 500));
      showToast('Aucune modification detectee. Reformule ta demande.', true);
      hideLoading();
      return;
    }

    showLoading('Application de ' + changes.changes.length + ' modifications...');

    // STEP 2: Apply changes locally (no IA needed)
    const u = JSON.parse(JSON.stringify(fiche));
    const applied = [];

    changes.changes.forEach(ch => {
      if (!ch.content) return;

      // Find target section (fuzzy match)
      let sec = u.base?.sections?.find(s => 
        s.title.toLowerCase().includes((ch.section || '').toLowerCase().slice(0, 20))
      );

      if (ch.action === 'add_section') {
        // Create new section
        const newSec = {
          title: ch.section || ch.content.split('.')[0],
          content: ch.content,
          concepts: [],
          keyPoints: [],
          warnings: [],
          examples: []
        };
        u.base.sections.push(newSec);
        applied.push('Nouvelle section: ' + newSec.title);
        return;
      }

      // Default to first section if no match
      if (!sec) sec = u.base?.sections?.[0];
      if (!sec) return;

      switch (ch.action) {
        case 'add_warning':
          sec.warnings.push(ch.content);
          applied.push('Warning: ' + ch.content.slice(0, 60));
          break;
        case 'add_example':
          sec.examples.push(ch.content);
          applied.push('Example: ' + ch.content.slice(0, 60));
          break;
        case 'add_keyPoint':
          sec.keyPoints.push(ch.content);
          applied.push('KeyPoint: ' + ch.content.slice(0, 60));
          break;
        case 'add_concept':
          const parts = ch.content.split(':');
          sec.concepts.push({
            term: (parts[0] || ch.content).trim(),
            definition: (parts.slice(1).join(':') || ch.content).trim(),
            ref: ''
          });
          applied.push('Concept: ' + (parts[0] || ch.content).slice(0, 60));
          break;
        case 'update_content':
          // Append to existing content rather than replace
          sec.content = (sec.content || '') + '\n\n' + ch.content;
          applied.push('Contenu enrichi: ' + sec.title);
          break;
        default:
          // Treat unknown actions as keyPoints
          sec.keyPoints.push(ch.content);
          applied.push('Point: ' + ch.content.slice(0, 60));
      }
    });

    if (!applied.length) {
      showToast('Aucune modification applicable', true);
      hideLoading();
      return;
    }

    // Add enrichment record
    u.enrichments.push({
      id: 'enr-disc-' + Date.now(),
      date: new Date().toISOString().split('T')[0],
      source: { type: 'discussion' },
      trigger: 'discussion',
      summary: changes.summary || applied.length + ' modifications appliquees',
      addedPoints: applied
    });

    // Add verification note
    if (changes.verificationNote) {
      if (!u.metadata.verificationNotes) u.metadata.verificationNotes = [];
      u.metadata.verificationNotes.push(
        new Date().toISOString().split('T')[0] + ': ' + changes.verificationNote
      );
    }

    // Increment version
    u.metadata.version = (u.metadata.version || 1) + 1;

    // Push to GitHub
    const ex = await ghGet(getFichePath());
    await ghPut(getFichePath(), u, 'Discussion v' + u.metadata.version + ': ' + (changes.summary || '').slice(0, 50), ex?.sha);
    fiche = u;

    // Save discussion as applied
    await saveDiscussion('applied');

    showToast('Fiche v' + u.metadata.version + ' — ' + applied.length + ' modifications !');
    
    // Show what was applied in the chat
    chatMsgs.push({
      role: 'assistant',
      content: '✅ **Fiche mise a jour (v' + u.metadata.version + ')**\n\n' +
        '**' + applied.length + ' modifications appliquees:**\n' +
        applied.map(a => '- ' + a).join('\n') +
        (changes.summary ? '\n\n*' + changes.summary + '*' : '') +
        '\n\nClique sur **Fiche** pour voir les changements.'
    });

    // Auto-switch to fiche
    currentView = 'fiche';

  } catch (e) {
    console.error('Apply error:', e);
    showToast('Erreur: ' + e.message, true);
  }

  hideLoading();
  render();
}

// Re-wire the global function
function applyDiscussionChanges() { requireToken(() => _doApplyChanges()); }
window.applyDiscussionChanges = applyDiscussionChanges;

console.log('v16.2: Discussion apply uses 2-step (extract changes + apply locally)');
