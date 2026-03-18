// StudyForge UI Enhancement - loaded AFTER patches.js
// FIX: removed auto-reload of categories at startup (caused 403 rate limit)
// Emojis fix now happens on first category navigation, not on page load

// === ENHANCED CSS ===
(function() {
  const style = document.createElement('style');
  style.textContent = `
    .cat-item {
      padding: 10px 14px !important;
      border-radius: 12px !important;
      margin-bottom: 4px !important;
      font-size: 13px !important;
      font-weight: 500 !important;
      transition: all .2s ease !important;
      border-left: 3px solid transparent !important;
    }
    .cat-item:hover {
      background: rgba(123,104,238,0.08) !important;
      border-left-color: rgba(123,104,238,0.3) !important;
      color: #e8e8f0 !important;
      transform: translateX(2px);
    }
    .cat-item.active {
      background: linear-gradient(135deg, rgba(123,104,238,0.15), rgba(96,165,250,0.08)) !important;
      border-left-color: #7B68EE !important;
      color: #e8e8f0 !important;
      font-weight: 700 !important;
      box-shadow: 0 2px 8px rgba(123,104,238,0.1);
    }
    .cat-item .cat-icon {
      font-size: 18px;
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 8px;
      background: rgba(123,104,238,0.08);
      flex-shrink: 0;
    }
    .cat-item.active .cat-icon {
      background: rgba(123,104,238,0.2);
    }
    .fiche-card {
      position: relative;
      overflow: hidden;
      padding: 20px !important;
      transition: all .2s ease !important;
      border-left: 3px solid #7B68EE !important;
    }
    .fiche-card:hover {
      border-color: #7B68EE !important;
      transform: translateY(-2px);
      box-shadow: 0 4px 16px rgba(123,104,238,0.12);
    }
    .fiche-card::after {
      content: '';
      position: absolute;
      top: 0;
      right: 0;
      width: 60px;
      height: 60px;
      background: radial-gradient(circle at top right, rgba(123,104,238,0.06), transparent 70%);
      pointer-events: none;
    }
    .cat-header-icon {
      font-size: 36px;
      width: 56px;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 16px;
      background: linear-gradient(135deg, rgba(123,104,238,0.15), rgba(96,165,250,0.1));
      border: 1px solid rgba(123,104,238,0.2);
      flex-shrink: 0;
    }
    .card { transition: all .15s ease; }
    .card:hover { border-color: rgba(123,104,238,0.2) !important; }
    #sidebar .btn-pri {
      background: linear-gradient(135deg, #7B68EE, #6C5CE7) !important;
      border-radius: 12px !important;
    }
    #sidebar .btn-sec { border-radius: 12px !important; }
    #sidebar ::-webkit-scrollbar { width: 3px; }
    #sidebar ::-webkit-scrollbar-thumb { background: rgba(123,104,238,0.2); border-radius: 3px; }
    .tag { letter-spacing: 0.3px; }
  `;
  document.head.appendChild(style);
})();

// === ENHANCED renderCats (with emoji icons in boxes) ===
const _origRenderCats = renderCats;
renderCats = function() {
  const el = document.getElementById('cat-list');
  if (!el) return _origRenderCats();

  el.innerHTML = cats.map(c => {
    const isActive = selCat?.id === c.id;
    return '<div class="cat-item ' + (isActive ? 'active' : '') + '" onclick="loadCat(\'' + c.id + '\')">' +
      '<span class="cat-icon">' + (c.icon || '📁') + '</span>' +
      '<span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c.name + '</span>' +
      '</div>';
  }).join('');
};
// renderCats() sera appelé par init() ci-dessous

// === ENHANCED CATEGORY PAGE ===
const _uiOrigRender = render;
render = function() {
  _uiOrigRender();
  const content = document.getElementById('content');
  if (!content) return;

  if (currentView === 'home' && selCat) {
    const h2 = content.querySelector('h2');
    if (h2 && !content.dataset.uiPatched) {
      content.dataset.uiPatched = 'true';
      const catIcon = cats.find(c => c.id === selCat.id)?.icon || '📁';
      const newHeader = document.createElement('div');
      newHeader.style.cssText = 'display:flex;align-items:center;gap:16px;margin-bottom:20px';
      newHeader.innerHTML = '<div class="cat-header-icon">' + catIcon + '</div>' +
        '<div><h2 style="font-size:22px;font-weight:800;margin-bottom:2px">' + selCat.name + '</h2>' +
        '<p style="font-size:12px;color:#6b6b88">' + ficheList.length + ' fiche' + (ficheList.length !== 1 ? 's' : '') + '</p></div>';
      if (h2.nextSibling && h2.nextSibling.tagName === 'P') h2.nextSibling.remove();
      h2.replaceWith(newHeader);
    }

    content.querySelectorAll('.fiche-card').forEach(card => {
      if (card.dataset.uiDone) return;
      card.dataset.uiDone = 'true';
      const titleEl = card.querySelector('h3');
      if (titleEl) {
        const raw = titleEl.textContent;
        titleEl.textContent = raw.charAt(0).toUpperCase() + raw.slice(1);
        titleEl.style.fontSize = '15px';
        titleEl.style.marginBottom = '6px';
      }
    });
  }
};
// render() sera appelé par init() ci-dessous

console.log('UI Enhancement: sidebar + cards polish (no auto-reload)');

// init() appelé ici pour garantir que TOUS les scripts (patches, dashboard, ui-enhance)
// ont overridé leurs fonctions AVANT le premier chargement de données
init();
