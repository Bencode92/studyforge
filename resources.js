// StudyForge - Ressources: YouTube, articles, refs légales par fiche
// Onglet dédié avec cache sessionStorage + affichage carte

// --- Cache ---
var _resCache = {};
function _resCacheKey() {
  return 'sf_res_' + (selCat ? selCat.id : '') + '_' + (fiche && fiche.metadata ? fiche.metadata.title : '');
}

// --- API call with web search ---
async function callClaudeWithSearch(sys, userMsg) {
  var body = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4000,
    system: sys,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: [{ role: 'user', content: userMsg }]
  };
  var r = await fetch(PROXY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  var d = await r.json();
  if (d.error) throw new Error(d.error.message || 'API error');
  var text = '';
  if (d.content) {
    d.content.forEach(function(block) {
      if (block.type === 'text') text += block.text;
    });
  }
  return text;
}

// --- Search resources ---
async function searchResources() {
  if (!fiche) return;

  var cacheKey = _resCacheKey();
  // Déjà en cache ?
  if (_resCache[cacheKey]) {
    _renderResourcesView(_resCache[cacheKey]);
    return;
  }

  showLoading('Recherche de ressources...');

  var title = (fiche.metadata && fiche.metadata.title) ? fiche.metadata.title : '';
  var category = (fiche.metadata && fiche.metadata.category) ? fiche.metadata.category : '';
  var keyTopics = (fiche.base && fiche.base.sections ? fiche.base.sections : [])
    .map(function(s) { return s.title; }).join(', ');

  var sys = 'Tu cherches des ressources pedagogiques en francais sur la gestion de patrimoine, finance et fiscalite. ' +
    'Utilise le web search pour trouver des VRAIES ressources.\n\n' +
    'IMPORTANT: reponds UNIQUEMENT en JSON valide, sans backticks, sans texte avant/apres.\n' +
    'Format:\n' +
    '{\n' +
    '  "youtube": [{"title":"","url":"","channel":"","description":""}],\n' +
    '  "articles": [{"title":"","url":"","source":"","date":"","description":""}],\n' +
    '  "legal": [{"title":"","url":"","source":"","description":""}]\n' +
    '}\n\n' +
    'REGLES:\n' +
    '- youtube: 4-6 videos de chaines connues (Finary, Matthieu Louvet, Xavier Delmas, Moneyvox, Grand Angle, Heu?reka, etc.)\n' +
    '- articles: 4-6 articles recents de sites specialises (Les Echos, Le Revenu, Moneyvox, BFM Patrimoine, Capital, etc.)\n' +
    '- legal: 2-3 references officielles (Legifrance, BOFiP, service-public.fr)\n' +
    '- URLs REELLES uniquement, trouvees via web search\n' +
    '- Tout en francais';

  var userMsg = 'Sujet: "' + title + '" (categorie: ' + category + ')\n' +
    'Topics: ' + keyTopics + '\n\n' +
    'Trouve des videos YouTube, articles recents et references legales sur ce sujet.';

  try {
    var result = await callClaudeWithSearch(sys, userMsg);
    var parsed = parseJ(result);

    if (!parsed) {
      // Fallback: essayer sans web search
      result = await callClaude(sys, userMsg, SONNET, 4000);
      parsed = parseJ(result);
    }

    if (parsed) {
      // Normaliser
      if (!parsed.youtube) parsed.youtube = [];
      if (!parsed.articles) parsed.articles = [];
      if (!parsed.legal) parsed.legal = [];
      parsed._searchDate = new Date().toLocaleDateString('fr-FR');
      parsed._title = title;
      _resCache[cacheKey] = parsed;
      hideLoading();
      _renderResourcesView(parsed);
      return;
    }

    // Dernier fallback: afficher le texte brut en markdown
    hideLoading();
    _renderResourcesRaw(result || 'Aucun resultat. Reessaie.');

  } catch (e) {
    hideLoading();

    // Si web search pas supporte, fallback
    if (e.message && (e.message.indexOf('tool') >= 0 || e.message.indexOf('400') >= 0)) {
      try {
        showLoading('Recherche (mode suggestions)...');
        var fallback = await callClaude(
          sys.replace('Utilise le web search pour trouver des VRAIES ressources.', 'Suggere des ressources CONNUES et REELLES basees sur ta connaissance.'),
          userMsg, SONNET, 4000
        );
        var pf = parseJ(fallback);
        if (pf) {
          if (!pf.youtube) pf.youtube = [];
          if (!pf.articles) pf.articles = [];
          if (!pf.legal) pf.legal = [];
          pf._searchDate = new Date().toLocaleDateString('fr-FR');
          pf._title = title;
          pf._isFallback = true;
          _resCache[cacheKey] = pf;
          hideLoading();
          _renderResourcesView(pf);
          return;
        }
        hideLoading();
        _renderResourcesRaw(fallback);
      } catch (e2) {
        hideLoading();
        showToast('Erreur: ' + e2.message, true);
      }
    } else {
      showToast('Erreur: ' + e.message, true);
    }
  }
}

// --- Extract YouTube video ID from URL ---
function _ytId(url) {
  if (!url) return null;
  var m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
  return m ? m[1] : null;
}

// --- Render structured resources ---
function _renderResourcesView(data) {
  var content = document.getElementById('content');
  if (!content) return;

  var h = '<div style="max-width:780px">';

  // Header
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">';
  h += '<div><h2 style="font-size:18px;font-weight:800;margin-bottom:3px">\uD83D\uDD0D Ressources</h2>';
  h += '<p style="font-size:11px;color:#8888a8">' + esc(data._title || '') + ' \u00b7 ' + (data._searchDate || '') + '</p></div>';
  h += '<button class="btn btn-sec" onclick="delete _resCache[_resCacheKey()];searchResources()" style="padding:8px 16px;font-size:11px;border-radius:10px">\uD83D\uDD04 Actualiser</button>';
  h += '</div>';

  if (data._isFallback) {
    h += '<div style="background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);border-radius:10px;padding:10px 14px;margin-bottom:16px;font-size:11px;color:#fbbf24">\u26A0\uFE0F Suggestions IA (pas de recherche web). V\u00e9rifie les liens.</div>';
  }

  // --- YouTube ---
  if (data.youtube && data.youtube.length > 0) {
    h += '<h3 style="font-size:15px;font-weight:700;margin-bottom:12px">\u25B6\uFE0F Vid\u00e9os YouTube</h3>';
    h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:10px;margin-bottom:24px">';
    data.youtube.forEach(function(v) {
      var vid = _ytId(v.url);
      h += '<div class="card" style="padding:0;overflow:hidden;cursor:pointer" onclick="window.open(\'' + esc(v.url || '') + '\',\'_blank\')">';
      // Thumbnail
      if (vid) {
        h += '<div style="position:relative;padding-top:56.25%;background:#0d0d1a">';
        h += '<img src="https://img.youtube.com/vi/' + vid + '/mqdefault.jpg" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'">';
        h += '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:48px;height:48px;background:rgba(255,0,0,0.85);border-radius:12px;display:flex;align-items:center;justify-content:center"><div style="width:0;height:0;border-left:16px solid #fff;border-top:10px solid transparent;border-bottom:10px solid transparent;margin-left:3px"></div></div>';
        h += '</div>';
      }
      h += '<div style="padding:12px 14px">';
      h += '<div style="font-size:13px;font-weight:600;line-height:1.4;margin-bottom:4px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(v.title || '') + '</div>';
      h += '<div style="font-size:10px;color:#8888a8;display:flex;align-items:center;gap:6px">';
      h += '<span style="color:#f87171">\u25CF</span> ' + esc(v.channel || 'YouTube');
      h += '</div>';
      if (v.description) h += '<p style="font-size:11px;color:#9999b0;margin-top:6px;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + esc(v.description) + '</p>';
      h += '</div></div>';
    });
    h += '</div>';
  }

  // --- Articles ---
  if (data.articles && data.articles.length > 0) {
    h += '<h3 style="font-size:15px;font-weight:700;margin-bottom:12px">\uD83D\uDCF0 Articles & Actualit\u00e9s</h3>';
    h += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">';
    data.articles.forEach(function(a) {
      h += '<div class="card" style="padding:14px 18px;cursor:pointer;display:flex;gap:14px;align-items:start" onclick="window.open(\'' + esc(a.url || '') + '\',\'_blank\')">';
      h += '<div style="width:36px;height:36px;border-radius:10px;background:rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">\uD83D\uDCF0</div>';
      h += '<div style="flex:1;min-width:0">';
      h += '<div style="font-size:13px;font-weight:600;line-height:1.4;margin-bottom:3px">' + esc(a.title || '') + '</div>';
      h += '<div style="font-size:10px;color:#8888a8;display:flex;gap:8px;margin-bottom:4px">';
      h += '<span style="color:#60a5fa">' + esc(a.source || 'Web') + '</span>';
      if (a.date) h += '<span>' + esc(a.date) + '</span>';
      h += '</div>';
      if (a.description) h += '<p style="font-size:11px;color:#9999b0;line-height:1.4">' + esc(a.description) + '</p>';
      h += '</div>';
      h += '<div style="color:#60a5fa;font-size:14px;flex-shrink:0;margin-top:2px">\u2192</div>';
      h += '</div>';
    });
    h += '</div>';
  }

  // --- Refs légales ---
  if (data.legal && data.legal.length > 0) {
    h += '<h3 style="font-size:15px;font-weight:700;margin-bottom:12px">\u2696\uFE0F R\u00e9f\u00e9rences l\u00e9gales</h3>';
    h += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:24px">';
    data.legal.forEach(function(l) {
      h += '<div class="card" style="padding:14px 18px;cursor:pointer;display:flex;gap:14px;align-items:start;border-left:3px solid #7B68EE" onclick="window.open(\'' + esc(l.url || '') + '\',\'_blank\')">';
      h += '<div style="width:36px;height:36px;border-radius:10px;background:rgba(123,104,238,0.1);display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">\u2696\uFE0F</div>';
      h += '<div style="flex:1;min-width:0">';
      h += '<div style="font-size:13px;font-weight:600;line-height:1.4;margin-bottom:3px">' + esc(l.title || '') + '</div>';
      h += '<div style="font-size:10px;color:#7B68EE;margin-bottom:4px">' + esc(l.source || 'Legifrance') + '</div>';
      if (l.description) h += '<p style="font-size:11px;color:#9999b0;line-height:1.4">' + esc(l.description) + '</p>';
      h += '</div></div>';
    });
    h += '</div>';
  }

  if ((!data.youtube || data.youtube.length === 0) && (!data.articles || data.articles.length === 0) && (!data.legal || data.legal.length === 0)) {
    h += '<div style="text-align:center;padding:40px;color:#8888a8"><p>Aucune ressource trouv\u00e9e. Clique "Actualiser" pour r\u00e9essayer.</p></div>';
  }

  h += '</div>';
  content.innerHTML = h;
}

// --- Fallback: raw markdown ---
function _renderResourcesRaw(text) {
  var content = document.getElementById('content');
  if (!content) return;
  var h = '<div style="max-width:780px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">';
  h += '<h2 style="font-size:18px;font-weight:800">\uD83D\uDD0D Ressources</h2>';
  h += '<button class="btn btn-sec" onclick="delete _resCache[_resCacheKey()];searchResources()" style="padding:8px 16px;font-size:11px;border-radius:10px">\uD83D\uDD04 Actualiser</button>';
  h += '</div>';
  h += '<div class="card" style="padding:20px">' + renderMd(text) + '</div>';
  h += '</div>';
  content.innerHTML = h;
}

// --- Render override: handle resources view ---
var _resOrigRender = render;
render = function() {
  _resOrigRender();
  var content = document.getElementById('content');
  if (!content) return;

  // Intercept resources view
  if (currentView === 'resources' && fiche) {
    var cached = _resCache[_resCacheKey()];
    if (cached) {
      _renderResourcesView(cached);
    } else {
      content.innerHTML = '<div style="max-width:780px;text-align:center;padding-top:60px">' +
        '<div style="font-size:42px;margin-bottom:12px">\uD83D\uDD0D</div>' +
        '<h2 style="font-size:20px;font-weight:800;margin-bottom:6px">Ressources</h2>' +
        '<p style="color:#8888a8;font-size:13px;margin-bottom:24px">Vid\u00e9os YouTube, articles d\'actualit\u00e9 et r\u00e9f\u00e9rences l\u00e9gales pour cette fiche</p>' +
        '<button class="btn btn-pri" onclick="searchResources()" style="padding:14px 32px;font-size:14px;border-radius:14px">\uD83D\uDD0D Rechercher des ressources</button>' +
        '</div>';
    }
  }

  // Also add a small resource indicator on fiche view
  if (currentView === 'fiche' && fiche && !content.dataset.resPatched) {
    content.dataset.resPatched = 'true';
    var enrichCard = content.querySelector('div[style*="border-style:dashed"]');
    if (enrichCard) {
      var resCard = document.createElement('div');
      resCard.className = 'card';
      resCard.style.cssText = 'border-color:rgba(96,165,250,0.3);cursor:pointer;transition:all .2s;margin-bottom:12px';
      resCard.innerHTML =
        '<div style="display:flex;align-items:center;gap:12px" onclick="currentView=\'resources\';render()">' +
        '<div style="width:40px;height:40px;border-radius:10px;background:rgba(96,165,250,0.1);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">\uD83D\uDD0D</div>' +
        '<div style="flex:1">' +
        '<h4 style="font-size:13px;font-weight:700;margin-bottom:2px">Trouver des ressources</h4>' +
        '<p style="font-size:11px;color:#8888a8">Vid\u00e9os YouTube, articles, r\u00e9f\u00e9rences l\u00e9gales</p>' +
        '</div>' +
        '<div style="color:#60a5fa;font-size:20px">\u2192</div>' +
        '</div>';
      enrichCard.parentElement.insertBefore(resCard, enrichCard);
    }
  }
};

window.searchResources = searchResources;
window._resCacheKey = _resCacheKey;
window._resCache = _resCache;

console.log('Resources v2: YouTube + articles + legal refs tab');
