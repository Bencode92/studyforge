// StudyForge v17 - Dashboard "À réviser" 
// FIX: loads on button click (not auto) to avoid GitHub API 403 rate limit

function calculateReviewPriority(ficheData) {
  const quiz = ficheData.quiz || {};
  const history = quiz.history || [];
  const weakPoints = quiz.weakPoints || [];
  const now = Date.now();

  if (history.length === 0) {
    return { level: 'new', label: 'Nouvelle', color: '#6b6b88', emoji: '⚪', score: null, daysSince: null, priority: 50 };
  }

  let totalScore = 0, totalMax = 0;
  history.forEach(h => {
    if (h.score && h.score.includes('/')) {
      const [got, max] = h.score.split('/').map(Number);
      if (!isNaN(got) && !isNaN(max) && max > 0) { totalScore += got; totalMax += max; }
    }
  });
  const avgScore = totalMax > 0 ? Math.round((totalScore / totalMax) * 100) : null;

  const lastDate = quiz.lastDate || history[history.length - 1]?.date;
  let daysSince = null;
  if (lastDate) {
    const d = new Date(lastDate);
    daysSince = Math.floor((now - d.getTime()) / (1000 * 60 * 60 * 24));
  }

  let level, label, color, emoji, priority;
  if (avgScore !== null && avgScore < 60 && daysSince !== null && daysSince >= 3) {
    level = 'urgent'; label = 'Urgent'; color = '#f87171'; emoji = '🔴'; priority = 100;
  } else if (avgScore !== null && avgScore < 60) {
    level = 'urgent'; label = 'Urgent'; color = '#f87171'; emoji = '🔴'; priority = 90;
  } else if (avgScore !== null && avgScore < 80 && daysSince !== null && daysSince >= 7) {
    level = 'review'; label = 'À revoir'; color = '#fbbf24'; emoji = '🟡'; priority = 70;
  } else if (avgScore !== null && avgScore < 80) {
    level = 'review'; label = 'À revoir'; color = '#fbbf24'; emoji = '🟡'; priority = 60;
  } else if (daysSince !== null && daysSince >= 14) {
    level = 'refresh'; label = 'Rafraîchir'; color = '#34d399'; emoji = '🟢'; priority = 40;
  } else {
    level = 'ok'; label = 'Maîtrisé'; color = '#7B68EE'; emoji = '✅'; priority = 10;
  }
  priority += Math.min(weakPoints.length * 5, 25);
  return { level, label, color, emoji, score: avgScore, daysSince, priority, weakCount: weakPoints.length, attempts: history.length };
}

const _dashOrigRender = render;
render = function() {
  _dashOrigRender();
  const content = document.getElementById('content');
  if (!content) return;

  if (currentView === 'home' && !selCat && !fiche) {
    if (cats.length > 0 && !content.dataset.dashPatched) {
      content.dataset.dashPatched = 'true';
      const btn = document.createElement('div');
      btn.style.cssText = 'text-align:center;margin-top:20px';
      btn.innerHTML = '<button class="btn btn-pri" onclick="requireToken(function(){loadDashboard(document.getElementById(\'content\'))})" style="padding:14px 28px;font-size:14px">📊 Voir le dashboard de révision</button>';
      content.appendChild(btn);
    }
  }
};

async function loadDashboard(container) {
  showLoading('Chargement du dashboard...');
  const allFiches = [];
  for (const cat of cats) {
    try {
      const meta = await ghGet('data/' + cat.id + '/_meta.json');
      let ids = meta?.content?.fiches || [];
      if (ids.length === 0) {
        const files = await ghLs('data/' + cat.id);
        ids = files.filter(f => f.name.endsWith('.json') && f.name !== '_meta.json').map(f => ({ id: f.name.replace('.json', ''), title: f.name.replace('.json', '').replace(/-/g, ' ') }));
      }
      for (const f of ids) {
        try {
          const ficheData = await ghGet('data/' + cat.id + '/' + f.id + '.json');
          if (ficheData?.content) {
            const review = calculateReviewPriority(ficheData.content);
            allFiches.push({ id: f.id, title: ficheData.content.metadata?.title || f.title || f.id, category: cat, review, sections: ficheData.content.base?.sections?.length || 0, enrichments: ficheData.content.enrichments?.length || 0, version: ficheData.content.metadata?.version || 1 });
          }
        } catch (e) {}
      }
    } catch (e) {}
  }
  allFiches.sort((a, b) => b.review.priority - a.review.priority);
  const counts = { urgent: 0, review: 0, refresh: 0, ok: 0, new: 0 };
  allFiches.forEach(f => counts[f.review.level]++);

  let h = '<div style="max-width:900px;margin:0 auto">';
  h += '<div style="text-align:center;margin-bottom:28px"><div style="font-size:42px;margin-bottom:8px">📚</div><h2 style="font-size:24px;font-weight:800;margin-bottom:4px">StudyForge</h2><p style="color:#6b6b88;font-size:13px">' + allFiches.length + ' fiches · ' + cats.length + ' catégories</p></div>';

  if (allFiches.length > 0) {
    h += '<div style="display:flex;gap:10px;margin-bottom:24px;flex-wrap:wrap;justify-content:center">';
    if (counts.urgent > 0) h += '<div style="background:#f8717122;border:1px solid #f8717133;border-radius:12px;padding:12px 20px;text-align:center;min-width:100px"><div style="font-size:24px;font-weight:800;color:#f87171">' + counts.urgent + '</div><div style="font-size:10px;color:#f87171;font-weight:600">URGENT</div></div>';
    if (counts.review > 0) h += '<div style="background:#fbbf2422;border:1px solid #fbbf2433;border-radius:12px;padding:12px 20px;text-align:center;min-width:100px"><div style="font-size:24px;font-weight:800;color:#fbbf24">' + counts.review + '</div><div style="font-size:10px;color:#fbbf24;font-weight:600">À REVOIR</div></div>';
    if (counts.refresh > 0) h += '<div style="background:#34d39922;border:1px solid #34d39933;border-radius:12px;padding:12px 20px;text-align:center;min-width:100px"><div style="font-size:24px;font-weight:800;color:#34d399">' + counts.refresh + '</div><div style="font-size:10px;color:#34d399;font-weight:600">RAFRAÎCHIR</div></div>';
    if (counts.ok > 0) h += '<div style="background:#7B68EE22;border:1px solid #7B68EE33;border-radius:12px;padding:12px 20px;text-align:center;min-width:100px"><div style="font-size:24px;font-weight:800;color:#7B68EE">' + counts.ok + '</div><div style="font-size:10px;color:#7B68EE;font-weight:600">MAÎTRISÉ</div></div>';
    if (counts.new > 0) h += '<div style="background:#1a1a33;border:1px solid #1a1a44;border-radius:12px;padding:12px 20px;text-align:center;min-width:100px"><div style="font-size:24px;font-weight:800;color:#6b6b88">' + counts.new + '</div><div style="font-size:10px;color:#6b6b88;font-weight:600">NOUVELLES</div></div>';
    h += '</div>';
  }

  const groups = [
    { level: 'urgent', title: '🔴 Révision urgente', desc: 'Score < 60% ou pas testée depuis longtemps' },
    { level: 'review', title: '🟡 À revoir', desc: 'Score < 80% ou pas révisée depuis 7+ jours' },
    { level: 'new', title: '⚪ Jamais testées', desc: 'Commence par un quiz pour évaluer ton niveau' },
    { level: 'refresh', title: '🟢 À rafraîchir', desc: 'Bien maîtrisées mais pas révisées depuis 14+ jours' },
    { level: 'ok', title: '✅ Maîtrisées', desc: 'Score > 80% et révisée récemment' }
  ];

  groups.forEach(g => {
    const fiches = allFiches.filter(f => f.review.level === g.level);
    if (fiches.length === 0) return;
    h += '<div style="margin-bottom:20px"><h3 style="font-size:15px;font-weight:700;margin-bottom:4px">' + g.title + '</h3><p style="font-size:11px;color:#6b6b88;margin-bottom:12px">' + g.desc + '</p>';
    fiches.forEach(f => {
      h += '<div class="card" style="padding:14px 18px;margin-bottom:8px;cursor:pointer;display:flex;align-items:center;gap:14px;border-left:3px solid ' + f.review.color + '" onclick="loadCat(\'' + f.category.id + '\').then(()=>loadFiche(\'' + f.id + '\'))">';
      h += '<div style="flex:1;min-width:0"><div style="display:flex;align-items:center;gap:8px;margin-bottom:3px"><span style="font-size:14px">' + (f.category.icon || '📁') + '</span><span style="font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(f.title) + '</span></div>';
      h += '<div style="display:flex;gap:8px;align-items:center;font-size:10px;color:#6b6b88"><span>' + f.category.name + '</span><span>·</span><span>' + f.sections + ' sections</span>';
      if (f.enrichments > 0) h += '<span>· +' + f.enrichments + ' enrichissements</span>';
      h += '</div></div>';
      h += '<div style="display:flex;gap:10px;align-items:center;flex-shrink:0">';
      if (f.review.weakCount > 0) h += '<span class="tag tag-org" style="font-size:9px">' + f.review.weakCount + ' pts faibles</span>';
      if (f.review.score !== null) { const sc = f.review.score >= 80 ? '#34d399' : f.review.score >= 60 ? '#fbbf24' : '#f87171'; h += '<div style="text-align:center"><div style="font-size:18px;font-weight:800;color:' + sc + '">' + f.review.score + '%</div><div style="font-size:9px;color:#6b6b88">' + f.review.attempts + ' quiz</div></div>'; }
      if (f.review.daysSince !== null) h += '<div style="text-align:center;min-width:40px"><div style="font-size:12px;font-weight:600;color:#9999b0">' + f.review.daysSince + 'j</div><div style="font-size:9px;color:#6b6b88">depuis</div></div>';
      h += '</div></div>';
    });
    h += '</div>';
  });

  if (allFiches.length === 0) {
    h += '<div style="text-align:center;padding:40px;color:#6b6b88"><p style="font-size:14px">Aucune fiche</p><p style="font-size:12px;margin-top:8px">Clique sur "+ Fiche" pour importer</p></div>';
  }
  h += '</div>';
  container.innerHTML = h;
  hideLoading();
}
window.loadDashboard = loadDashboard;

console.log('v17: Dashboard (click to load)');
