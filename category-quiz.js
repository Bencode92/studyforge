// StudyForge - Quiz Journalier par Catégorie
// Section "Quiz du jour" sur le dashboard, 10 QCM par catégorie
// Charge les fiches uniquement au lancement du quiz (pas au chargement dashboard)

// --- Storage ---
const _today = () => new Date().toISOString().split('T')[0];
const _dailyKey = (catId) => 'sf_catquiz_' + catId + '_' + _today();
const _scoresKey = 'sf_catquiz_scores';

function _getDailyQuiz(catId) {
  try { return JSON.parse(sessionStorage.getItem(_dailyKey(catId))); } catch { return null; }
}
function _saveDailyQuiz(catId, data) {
  sessionStorage.setItem(_dailyKey(catId), JSON.stringify(data));
}
function _getScores() {
  try { return JSON.parse(localStorage.getItem(_scoresKey)) || {}; } catch { return {}; }
}
function _saveScore(catId, score, total) {
  const scores = _getScores();
  if (!scores[catId]) scores[catId] = [];
  scores[catId].push({ date: _today(), score, total });
  if (scores[catId].length > 30) scores[catId] = scores[catId].slice(-30);
  localStorage.setItem(_scoresKey, JSON.stringify(scores));
}

// --- Monkey-patch loadDashboard: inject quiz section after render ---
const _origLoadDashboard = loadDashboard;
loadDashboard = async function(container) {
  await _origLoadDashboard(container);
  _injectQuizSection(container);
};

// --- Inject quiz section into dashboard ---
function _injectQuizSection(container) {
  const wrapper = container.querySelector('div');
  if (!wrapper) return;

  const scores = _getScores();
  let h = '<div id="daily-quiz-section" style="margin-bottom:32px">';
  h += '<h3 style="font-size:17px;font-weight:800;margin-bottom:4px">\uD83C\uDFAF Quiz journalier</h3>';
  h += '<p style="font-size:11px;color:#8888a8;margin-bottom:16px">10 questions par cat\u00e9gorie \u2014 teste tes connaissances chaque jour</p>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:10px">';

  cats.forEach(cat => {
    const daily = _getDailyQuiz(cat.id);
    const history = scores[cat.id] || [];
    const doneToday = daily && daily.completed;

    let borderColor = '#1a1a44';
    let scoreColor = '#8888a8';
    if (doneToday) {
      const pct = Math.round((daily.score / daily.total) * 100);
      borderColor = pct >= 80 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#f87171';
      scoreColor = borderColor;
    } else if (history.length > 0) {
      const last = history[history.length - 1];
      const pct = Math.round((last.score / last.total) * 100);
      scoreColor = pct >= 80 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#f87171';
    }

    h += '<div class="card" style="padding:16px;border-left:3px solid ' + borderColor + '">';

    // Header
    h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">';
    h += '<span style="font-size:22px">' + (cat.icon || '\uD83D\uDCC1') + '</span>';
    h += '<div style="flex:1;min-width:0"><div style="font-size:14px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(cat.name) + '</div></div>';

    if (doneToday) {
      var pctD = Math.round((daily.score / daily.total) * 100);
      h += '<div style="text-align:center"><div style="font-size:20px;font-weight:800;color:' + scoreColor + '">' + pctD + '%</div><div style="font-size:9px;color:#8888a8">aujourd\'hui</div></div>';
    } else if (history.length > 0) {
      var last = history[history.length - 1];
      var pctL = Math.round((last.score / last.total) * 100);
      h += '<div style="text-align:center;opacity:0.6"><div style="font-size:16px;font-weight:700;color:' + scoreColor + '">' + pctL + '%</div><div style="font-size:9px;color:#8888a8">' + last.date.slice(5) + '</div></div>';
    }
    h += '</div>';

    // History dots
    if (history.length > 0) {
      h += '<div style="display:flex;gap:4px;margin-bottom:10px">';
      history.slice(-7).forEach(function(s) {
        var p = Math.round((s.score / s.total) * 100);
        var c = p >= 80 ? '#34d399' : p >= 60 ? '#fbbf24' : '#f87171';
        h += '<div title="' + s.date + ': ' + s.score + '/' + s.total + '" style="width:8px;height:8px;border-radius:50%;background:' + c + '"></div>';
      });
      h += '</div>';
    }

    // Buttons
    if (doneToday) {
      h += '<div style="display:flex;gap:6px">';
      h += '<button class="btn btn-sec" onclick="showCatQuizResults(\'' + cat.id + '\')" style="flex:1;padding:8px;font-size:11px;border-radius:10px">\uD83D\uDCCB R\u00e9sultats</button>';
      h += '<button class="btn btn-sec" onclick="startCatQuiz(\'' + cat.id + '\',true)" style="flex:1;padding:8px;font-size:11px;border-radius:10px">\uD83D\uDD04 Refaire</button>';
      h += '</div>';
    } else {
      h += '<button class="btn btn-pri" onclick="startCatQuiz(\'' + cat.id + '\')" style="width:100%;padding:10px;font-size:12px;border-radius:10px">\u25B6 Lancer le quiz</button>';
    }

    h += '</div>';
  });

  h += '</div></div>';

  // Insert after counters or header
  var countersDiv = wrapper.querySelector('div[style*="justify-content:center"]');
  var insertAfter = countersDiv || wrapper.querySelector('div[style*="text-align:center"]');
  if (insertAfter && insertAfter.nextSibling) {
    var el = document.createElement('div');
    el.innerHTML = h;
    insertAfter.parentNode.insertBefore(el.firstChild, insertAfter.nextSibling);
  } else {
    wrapper.insertAdjacentHTML('beforeend', h);
  }
}

// --- Fetch fiches for a category (on demand, uses cache) ---
async function _fetchCatFiches(catId) {
  var fiches = [];
  try {
    var meta = await ghGet('data/' + catId + '/_meta.json');
    var ids = (meta && meta.content && meta.content.fiches) ? meta.content.fiches : [];
    if (ids.length === 0) {
      var files = await ghLs('data/' + catId);
      ids = files.filter(function(f) { return f.name.endsWith('.json') && f.name !== '_meta.json'; })
        .map(function(f) { return { id: f.name.replace('.json', ''), title: f.name.replace('.json', '').replace(/-/g, ' ') }; });
    }
    for (var i = 0; i < ids.length; i++) {
      try {
        var d = await ghGet('data/' + catId + '/' + ids[i].id + '.json');
        if (d && d.content) fiches.push(d.content);
      } catch(e) {}
    }
  } catch(e) {}
  return fiches;
}

// --- Start Quiz ---
async function startCatQuiz(catId, forceNew) {
  var cat = cats.find(function(c) { return c.id === catId; });
  if (!cat) return;

  if (!forceNew) {
    var existing = _getDailyQuiz(catId);
    if (existing && existing.questions && !existing.completed) {
      _showCatQuizUI(catId, existing);
      return;
    }
  }

  showLoading('Chargement des fiches ' + cat.name + '...');
  var fichesData = await _fetchCatFiches(catId);
  if (fichesData.length === 0) {
    hideLoading();
    showToast('Aucune fiche dans ' + cat.name, true);
    return;
  }

  showLoading('G\u00e9n\u00e9ration du quiz ' + cat.name + '...');

  var ctx = '';
  fichesData.forEach(function(f, i) {
    ctx += '\n=== FICHE ' + (i + 1) + ': ' + (f.metadata && f.metadata.title ? f.metadata.title : 'Sans titre') + ' ===\n';
    var sections = (f.base && f.base.sections) ? f.base.sections : [];
    sections.forEach(function(s) {
      ctx += '## ' + s.title + '\n';
      if (s.content) ctx += s.content.slice(0, 200) + '\n';
      if (s.concepts && s.concepts.length) ctx += 'Concepts: ' + s.concepts.map(function(c) { return c.term + ' = ' + (c.definition || '').slice(0, 60); }).join(' | ') + '\n';
      if (s.keyPoints && s.keyPoints.length) ctx += 'Points cl\u00e9s: ' + s.keyPoints.slice(0, 5).join(' | ') + '\n';
      if (s.warnings && s.warnings.length) ctx += 'Pi\u00e8ges: ' + s.warnings.slice(0, 3).join(' | ') + '\n';
    });
  });
  ctx = ctx.slice(0, 12000);

  var prev = _getDailyQuiz(catId);
  var prevWrong = (prev && prev.wrongTopics) ? prev.wrongTopics : [];

  var sys = 'Tu generes des QCM pour un quiz journalier. ' +
    'Categorie: "' + cat.name + '" (' + fichesData.length + ' fiches). ' +
    'REGLES:\n' +
    '- Exactement 10 questions QCM a 4 choix (A,B,C,D)\n' +
    '- Mix: 3 definitions/theorie, 4 applications, 3 pieges/distinctions\n' +
    '- Puise dans TOUTES les fiches, pas une seule\n' +
    '- Chaque question: champ "source" = titre de la fiche d\'origine\n' +
    '- Difficulte moderee\n' +
    (prevWrong.length ? '- Insiste sur ces sujets faibles: ' + prevWrong.slice(0, 5).join(', ') + '\n' : '') +
    '- JSON array UNIQUEMENT, sans backticks\n' +
    'Format: [{"id":1,"question":"","options":["A) ...","B) ...","C) ...","D) ..."],"correct":"A","explanation":"","source":"titre fiche"}]';

  try {
    var r = await callClaude(sys, 'Contenu:\n' + ctx, HAIKU, 4000);
    var parsed = parseJ(r);
    if (parsed && Array.isArray(parsed) && parsed.length > 0) {
      var quizData = {
        catId: catId, catName: cat.name, catIcon: cat.icon,
        date: _today(), questions: parsed,
        answers: {}, currentQ: 0,
        completed: false, score: 0, total: parsed.length
      };
      _saveDailyQuiz(catId, quizData);
      hideLoading();
      _showCatQuizUI(catId, quizData);
    } else {
      hideLoading();
      showToast('Erreur: r\u00e9ponse IA invalide', true);
    }
  } catch (e) {
    hideLoading();
    showToast('Erreur: ' + e.message, true);
  }
}

// --- Quiz UI ---
function _showCatQuizUI(catId, quizData) {
  var content = document.getElementById('content');
  if (!content) return;

  var q = quizData.questions[quizData.currentQ];
  if (!q) { _showCatQuizCorrection(catId, quizData); return; }

  var selected = quizData.answers[q.id];
  var progress = quizData.currentQ + 1;
  var total = quizData.questions.length;
  var pct = Math.round((progress / total) * 100);

  var h = '<div style="max-width:700px;margin:0 auto;padding-top:20px">';

  h += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px">';
  h += '<div style="display:flex;align-items:center;gap:10px">';
  h += '<button class="btn btn-sec" onclick="backToDashboard()" style="padding:6px 12px;font-size:11px;border-radius:8px">\u2190 Retour</button>';
  h += '<span style="font-size:20px">' + (quizData.catIcon || '\uD83D\uDCC1') + '</span>';
  h += '<span style="font-size:16px;font-weight:700">' + esc(quizData.catName) + '</span>';
  h += '</div>';
  h += '<span style="font-size:13px;font-weight:600;color:#7B68EE">' + progress + '/' + total + '</span>';
  h += '</div>';

  h += '<div style="width:100%;height:4px;background:#1a1a33;border-radius:2px;margin-bottom:24px">';
  h += '<div style="width:' + pct + '%;height:100%;background:linear-gradient(90deg,#7B68EE,#6C5CE7);border-radius:2px;transition:width .3s ease"></div>';
  h += '</div>';

  h += '<div class="card" style="padding:24px;margin-bottom:16px">';
  h += '<div style="font-size:10px;color:#8888a8;margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Question ' + progress + (q.source ? ' \u00b7 ' + esc(q.source) : '') + '</div>';
  h += '<p style="font-size:15px;font-weight:600;line-height:1.6">' + esc(q.question) + '</p>';
  h += '</div>';

  (q.options || []).forEach(function(opt) {
    var letter = opt.charAt(0);
    var isSelected = selected === letter;
    var style = isSelected
      ? 'background:rgba(123,104,238,0.15);border-color:#7B68EE;color:#e8e8f0'
      : 'background:var(--card);border-color:var(--brd);color:var(--txt)';
    h += '<div onclick="selectCatQuizAnswer(\'' + catId + '\',' + q.id + ',\'' + letter + '\')" class="card" style="padding:14px 18px;margin-bottom:8px;cursor:pointer;' + style + ';transition:all .15s ease;display:flex;align-items:center;gap:12px">';
    h += '<div style="width:30px;height:30px;border-radius:50%;border:2px solid ' + (isSelected ? '#7B68EE' : '#2a2a44') + ';display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;flex-shrink:0;' + (isSelected ? 'background:#7B68EE;color:#fff' : 'color:#8888a8') + '">' + letter + '</div>';
    h += '<span style="font-size:13px;line-height:1.5">' + esc(opt.slice(2).trim()) + '</span>';
    h += '</div>';
  });

  h += '<div style="margin-top:20px;text-align:right">';
  if (selected) {
    if (quizData.currentQ < total - 1) {
      h += '<button class="btn btn-pri" onclick="nextCatQuizQ(\'' + catId + '\')" style="padding:12px 28px;font-size:13px;border-radius:12px">Suivante \u2192</button>';
    } else {
      h += '<button class="btn btn-pri" onclick="finishCatQuiz(\'' + catId + '\')" style="padding:12px 28px;font-size:13px;border-radius:12px;background:linear-gradient(135deg,#34d399,#059669)">\u2713 Terminer</button>';
    }
  } else {
    h += '<span style="font-size:12px;color:#44445a">S\u00e9lectionne une r\u00e9ponse</span>';
  }
  h += '</div></div>';

  content.innerHTML = h;
}

function selectCatQuizAnswer(catId, qId, letter) {
  var d = _getDailyQuiz(catId); if (!d) return;
  d.answers[qId] = letter;
  _saveDailyQuiz(catId, d);
  _showCatQuizUI(catId, d);
}

function nextCatQuizQ(catId) {
  var d = _getDailyQuiz(catId); if (!d) return;
  d.currentQ++;
  _saveDailyQuiz(catId, d);
  _showCatQuizUI(catId, d);
}

function finishCatQuiz(catId) {
  var d = _getDailyQuiz(catId); if (!d) return;
  var correct = 0;
  var wrongTopics = [];
  d.questions.forEach(function(q) {
    if (d.answers[q.id] === q.correct) correct++;
    else if (q.source) wrongTopics.push(q.source);
  });
  d.completed = true;
  d.score = correct;
  d.total = d.questions.length;
  d.wrongTopics = wrongTopics.filter(function(v, i, a) { return a.indexOf(v) === i; });
  _saveDailyQuiz(catId, d);
  _saveScore(catId, correct, d.questions.length);
  _showCatQuizCorrection(catId, d);
}

// --- Correction UI ---
function _showCatQuizCorrection(catId, d) {
  var content = document.getElementById('content');
  if (!content) return;

  var pct = Math.round((d.score / d.total) * 100);
  var scoreColor = pct >= 80 ? '#34d399' : pct >= 60 ? '#fbbf24' : '#f87171';
  var emoji = pct >= 80 ? '\uD83C\uDF89' : pct >= 60 ? '\uD83D\uDCAA' : '\uD83D\uDCD6';
  var msg = pct >= 80 ? 'Excellent !' : pct >= 60 ? 'Pas mal, continue !' : '\u00c0 r\u00e9viser !';

  var h = '<div style="max-width:700px;margin:0 auto;padding-top:20px">';

  h += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">';
  h += '<button class="btn btn-sec" onclick="backToDashboard()" style="padding:6px 12px;font-size:11px;border-radius:8px">\u2190 Dashboard</button>';
  h += '<span style="font-size:20px">' + (d.catIcon || '\uD83D\uDCC1') + '</span>';
  h += '<span style="font-size:16px;font-weight:700">' + esc(d.catName) + '</span>';
  h += '</div>';

  h += '<div class="card" style="text-align:center;padding:28px;margin-bottom:24px;border-top:3px solid ' + scoreColor + '">';
  h += '<div style="font-size:42px;margin-bottom:8px">' + emoji + '</div>';
  h += '<div style="font-size:36px;font-weight:800;color:' + scoreColor + '">' + pct + '%</div>';
  h += '<div style="font-size:15px;font-weight:600;margin:6px 0">' + d.score + '/' + d.total + ' \u2014 ' + msg + '</div>';
  h += '<div style="font-size:11px;color:#8888a8">' + d.date + '</div>';
  h += '</div>';

  h += '<div style="display:flex;gap:8px;margin-bottom:24px">';
  h += '<button class="btn btn-pri" onclick="startCatQuiz(\'' + catId + '\',true)" style="flex:1;padding:12px;font-size:13px;border-radius:12px">\uD83D\uDD04 Nouveau quiz</button>';
  h += '<button class="btn btn-sec" onclick="backToDashboard()" style="flex:1;padding:12px;font-size:13px;border-radius:12px">\u2190 Dashboard</button>';
  h += '</div>';

  h += '<h3 style="font-size:15px;font-weight:700;margin-bottom:12px">D\u00e9tail des r\u00e9ponses</h3>';
  d.questions.forEach(function(q, i) {
    var ua = d.answers[q.id];
    var ok = ua === q.correct;
    var bc = ok ? '#34d399' : '#f87171';

    h += '<div class="card" style="padding:16px;margin-bottom:8px;border-left:3px solid ' + bc + '">';
    h += '<div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:8px">';
    h += '<span style="font-size:13px;font-weight:600">' + (i + 1) + '. ' + esc(q.question) + '</span>';
    h += '<span style="font-size:16px;flex-shrink:0;margin-left:8px">' + (ok ? '\u2705' : '\u274C') + '</span>';
    h += '</div>';

    if (!ok) {
      var userOpt = (q.options || []).find(function(o) { return o.charAt(0) === ua; }) || ua || 'Pas r\u00e9pondu';
      var correctOpt = (q.options || []).find(function(o) { return o.charAt(0) === q.correct; }) || q.correct;
      h += '<div style="font-size:11px;margin-bottom:4px;color:#f87171">Ta r\u00e9ponse: ' + esc(String(userOpt)) + '</div>';
      h += '<div style="font-size:11px;margin-bottom:6px;color:#34d399">Bonne r\u00e9ponse: ' + esc(correctOpt) + '</div>';
    }
    if (q.explanation) h += '<div style="font-size:11px;color:#9999b0;line-height:1.5">' + esc(q.explanation) + '</div>';
    if (q.source) h += '<div style="font-size:10px;color:#44445a;margin-top:4px">\uD83D\uDCC4 ' + esc(q.source) + '</div>';
    h += '</div>';
  });

  h += '</div>';
  content.innerHTML = h;
}

function showCatQuizResults(catId) {
  var d = _getDailyQuiz(catId);
  if (d) _showCatQuizCorrection(catId, d);
}

function backToDashboard() {
  selCat = null; fiche = null; currentView = 'home';
  var c = document.getElementById('content');
  if (c) delete c.dataset.dashPatched;
  render();
}

window.startCatQuiz = startCatQuiz;
window.selectCatQuizAnswer = selectCatQuizAnswer;
window.nextCatQuizQ = nextCatQuizQ;
window.finishCatQuiz = finishCatQuiz;
window.showCatQuizResults = showCatQuizResults;
window.backToDashboard = backToDashboard;

console.log('Category Quiz: daily 10-question QCM per category');
