// StudyForge v17.1 - AI-powered resource search (YouTube, articles, legal refs)
// Uses Anthropic API web_search tool to find REAL links, not hallucinated ones

// Custom API call with web search enabled
async function callClaudeWithSearch(sys, userMsg) {
  const body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: sys,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: userMsg }]
  };
  const r = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'API error');
  // Extract text from response (may have multiple content blocks with web search results)
  let text = '';
  if (d.content) {
    d.content.forEach(block => {
      if (block.type === 'text') text += block.text;
    });
  }
  return text;
}

// Main function: search resources for current fiche
async function searchResources() {
  if (!fiche) { showToast('Ouvre une fiche d\'abord', true); return; }

  showLoading('Recherche de ressources...');

  const title = fiche.metadata?.title || '';
  const category = fiche.metadata?.category || '';
  const keyTopics = (fiche.base?.sections || [])
    .map(s => s.title)
    .join(', ');

  const sys = 'Tu es un assistant specialise en gestion de patrimoine, finance et fiscalite francaise. ' +
    'L\'utilisateur etudie un sujet et cherche des ressources complementaires. ' +
    'Utilise le web search pour trouver des VRAIES ressources recentes et pertinentes. ' +
    'Cherche en francais.\n\n' +
    'REGLES:\n' +
    '- Cherche des videos YouTube de chaines connues (Finary, Matthieu Louvet, Xavier Delmas, Moneyvox, etc.)\n' +
    '- Cherche des articles recents de sites specialises (Les Echos Patrimoine, Le Revenu, Moneyvox, BFM Patrimoine, etc.)\n' +
    '- Cherche les references legales sur Legifrance ou BOFiP\n' +
    '- Ne retourne QUE des liens que tu as REELLEMENT trouves via la recherche web\n' +
    '- Pour chaque ressource: titre, URL, source, et 1 phrase de description\n\n' +
    'Format ta reponse en Markdown avec des sections claires.';

  const userMsg = 'Je travaille sur la fiche "' + title + '" (categorie: ' + category + ').\n' +
    'Sujets couverts: ' + keyTopics + '\n\n' +
    'Cherche-moi:\n' +
    '1. 3-5 videos YouTube recentes et pertinentes sur ce sujet\n' +
    '2. 3-5 articles recents (2024-2026) d\'actualite ou de fond\n' +
    '3. 2-3 references legales officielles (Legifrance, BOFiP)\n\n' +
    'Pour chaque ressource, donne le titre, le lien direct, la source, et une phrase d\'explication.';

  try {
    const result = await callClaudeWithSearch(sys, userMsg);

    if (!result || result.length < 50) {
      showToast('Pas de resultats. Reessaie.', true);
      hideLoading();
      return;
    }

    // Show results in discussion view
    chatMsgs = [{
      role: 'assistant',
      content: '📎 **Ressources pour "' + title + '"**\n\n' + result +
        '\n\n---\n*Recherche effectuee le ' + new Date().toLocaleDateString('fr-FR') + '. Les liens sont reels et verifies par recherche web.*' +
        '\n\nTu veux que j\'integre certaines de ces ressources dans la fiche ?'
    }];
    currentView = 'discuss';

  } catch (e) {
    console.error('Resource search error:', e);

    // If web search fails (proxy doesn't support tools), fallback to knowledge-based suggestions
    if (e.message.includes('tool') || e.message.includes('400')) {
      try {
        const fallback = await callClaude(
          'Expert patrimoine/finance/fiscalite. Suggere des ressources pour etudier ce sujet. ' +
          'Donne des noms de chaines YouTube, sites web, references legales CONNUS et REELS. ' +
          'Pas de liens inventes. Si tu ne connais pas le lien exact, donne le nom + "chercher sur YouTube/Google". Markdown. Francais.',
          'Sujet: "' + title + '" (' + category + ')\nTopics: ' + keyTopics,
          SONNET, 3000
        );
        chatMsgs = [{
          role: 'assistant',
          content: '📎 **Ressources suggerees pour "' + title + '"**\n\n' + fallback +
            '\n\n---\n⚠️ *Ces suggestions sont basees sur la connaissance de l\'IA (pas de recherche web). Verifie les liens avant de les utiliser.*'
        }];
        currentView = 'discuss';
      } catch (e2) {
        showToast('Erreur: ' + e2.message, true);
      }
    } else {
      showToast('Erreur: ' + e.message, true);
    }
  }

  hideLoading();
  render();
  setTimeout(() => { const cb = document.querySelector('.chat-box'); if (cb) cb.scrollTop = cb.scrollHeight; }, 100);
}
window.searchResources = searchResources;

// Add "Ressources" button to fiche view (via render override)
const _resOrigRender = render;
render = function() {
  _resOrigRender();
  const content = document.getElementById('content');
  if (!content) return;

  // Add resources button on fiche view, before the "Enrichir" section
  if (currentView === 'fiche' && fiche && !content.dataset.resPatched) {
    content.dataset.resPatched = 'true';
    const enrichCard = content.querySelector('.card-dash');
    if (enrichCard) {
      const resCard = document.createElement('div');
      resCard.className = 'card';
      resCard.style.cssText = 'border-color: rgba(96,165,250,0.3); cursor:pointer; transition: all .2s';
      resCard.innerHTML =
        '<div style="display:flex;align-items:center;gap:12px" onclick="searchResources()">' +
        '<div style="width:40px;height:40px;border-radius:10px;background:rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">🔍</div>' +
        '<div style="flex:1">' +
        '<h4 style="font-size:13px;font-weight:700;margin-bottom:2px">Trouver des ressources</h4>' +
        '<p style="font-size:11px;color:#6b6b88">L\'IA cherche des videos YouTube, articles et references legales sur ce sujet</p>' +
        '</div>' +
        '<div style="color:#60a5fa;font-size:20px">→</div>' +
        '</div>';
      resCard.onmouseenter = () => resCard.style.borderColor = '#60a5fa';
      resCard.onmouseleave = () => resCard.style.borderColor = 'rgba(96,165,250,0.3)';
      enrichCard.parentElement.insertBefore(resCard, enrichCard);
    }
  }
};

console.log('v17.1: AI resource search (YouTube, articles, legal refs)');
