// ── View management ──────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  window.scrollTo(0, 0);
}

// ── XSS escape ───────────────────────────────────────────────────
function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Score color ───────────────────────────────────────────────────
function scoreClass(n) {
  if (n == null) return '';
  if (n >= 70) return 'score-green';
  if (n >= 50) return 'score-yellow';
  return 'score-red';
}

// ── Upload handling ───────────────────────────────────────────────
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');

dropZone.addEventListener('click', () => fileInput.click());
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag-active'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-active'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-active');
  const file = e.dataTransfer.files[0];
  if (file) submitFile(file);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) submitFile(fileInput.files[0]);
});

document.getElementById('demo-btn').addEventListener('click', startDemo);
document.getElementById('new-plan-btn').addEventListener('click', () => {
  resetLoading();
  showView('upload');
});

async function submitFile(file) {
  const formData = new FormData();
  formData.append('healthFile', file);
  try {
    const res = await fetch('/api/analyze', { method: 'POST', body: formData });
    const { sessionId, error } = await res.json();
    if (error) return alert('Upload error: ' + error);
    resetLoading();
    showView('loading');
    watchSession(sessionId);
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

async function startDemo() {
  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ demo: 'true' }),
    });
    const { sessionId, error } = await res.json();
    if (error) return alert('Error: ' + error);
    resetLoading();
    showView('loading');
    watchSession(sessionId);
  } catch (err) {
    alert('Network error: ' + err.message);
  }
}

// ── Loading / SSE ─────────────────────────────────────────────────
function resetLoading() {
  const agentKeys = ['sleep', 'recovery', 'activity', 'workoutHistory'];
  agentKeys.forEach((k) => setAgentStatus(k, 'pending'));
  document.getElementById('claude-banner').classList.remove('visible');
}

function setAgentStatus(key, status) {
  const dot = document.getElementById(`dot-${key}`);
  const label = document.getElementById(`label-${key}`);
  const card = document.getElementById(`card-${key}`);
  if (!dot) return;
  dot.className = `status-dot ${status}`;
  label.className = `agent-status-label ${status}`;
  label.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  card.className = `agent-card ${status === 'pending' ? '' : status}`;
}

function watchSession(sessionId) {
  const evtSource = new EventSource(`/api/status/${sessionId}`);

  evtSource.onmessage = (e) => {
    const data = JSON.parse(e.data);

    if (data.agents) {
      Object.entries(data.agents).forEach(([key, status]) => {
        if (key === 'claude') {
          const banner = document.getElementById('claude-banner');
          if (status === 'running') banner.classList.add('visible');
          if (status === 'completed') banner.classList.remove('visible');
        } else {
          setAgentStatus(key, status);
        }
      });
    }

    if (data.sessionStatus === 'complete') {
      evtSource.close();
      loadResult(sessionId);
    } else if (data.sessionStatus === 'error') {
      evtSource.close();
      alert('Analysis failed: ' + (data.error || 'Unknown error'));
      showView('upload');
    }
  };

  evtSource.onerror = () => {
    evtSource.close();
  };
}

async function loadResult(sessionId) {
  try {
    const res = await fetch(`/api/result/${sessionId}`);
    const data = await res.json();
    renderResults(data);
    showView('results');
  } catch (err) {
    alert('Failed to load results: ' + err.message);
    showView('upload');
  }
}

// ── Results rendering ─────────────────────────────────────────────
function renderResults({ workoutPlan, agentLogs, metrics }) {
  renderMetrics(metrics);
  renderWorkoutPlan(workoutPlan);
  renderAgentLogs(agentLogs);
}

function renderMetrics(metrics) {
  const { sleep, recovery, activity, history } = metrics;

  // Sleep
  const sleepScore = sleep?.score ?? null;
  const sleepEl = document.getElementById('score-sleep');
  sleepEl.textContent = sleepScore ?? '—';
  sleepEl.className = `metric-score ${scoreClass(sleepScore)}`;
  document.getElementById('sub-sleep').textContent =
    sleep ? `${sleep.avgDuration} avg · ${sleep.deepSleepPct?.toFixed(0)}% deep` : 'No data';

  // Recovery
  const recScore = recovery?.score ?? null;
  const recEl = document.getElementById('score-recovery');
  recEl.textContent = recScore ?? '—';
  recEl.className = `metric-score ${scoreClass(recScore)}`;
  document.getElementById('sub-recovery').textContent =
    recovery ? `HRV ${recovery.todayHRV ?? 'N/A'}ms · RHR ${recovery.todayRestingHR ?? 'N/A'}bpm` : 'No data';

  // Activity
  const actScore = activity?.load ?? null;
  const actEl = document.getElementById('score-activity');
  actEl.textContent = actScore ?? '—';
  actEl.className = `metric-score ${scoreClass(actScore)}`;
  document.getElementById('sub-activity').textContent =
    activity ? `${activity.avgDailySteps?.toLocaleString()} steps avg` : 'No data';

  // Workout history — show count, color by overtraining risk
  const histEl = document.getElementById('score-history');
  histEl.textContent = history?.totalWorkouts ?? '—';
  const riskColor = { none: 'score-green', low: 'score-green', moderate: 'score-yellow', high: 'score-red' };
  histEl.className = `metric-score ${riskColor[history?.overtTrainingRisk] || 'score-blue'}`;
  document.getElementById('sub-history').textContent =
    history ? `${history.restDays} rest days · ${history.overtTrainingRisk} risk` : 'No data';
}

function badgeClass(workoutType) {
  const t = (workoutType || '').toLowerCase();
  if (t.includes('strength') || t.includes('weight')) return 'badge-strength';
  if (t.includes('hiit') || t.includes('interval')) return 'badge-hiit';
  if (t.includes('cardio') || t.includes('run') || t.includes('cycling')) return 'badge-cardio';
  if (t.includes('recovery') || t.includes('yoga') || t.includes('mobility')) return 'badge-recovery';
  if (t.includes('rest')) return 'badge-rest';
  return 'badge-default';
}

function intensityGradient(score) {
  // score 1-10: green→yellow→red
  const pct = (score - 1) / 9;
  if (pct <= 0.5) {
    const g = Math.round(185 + (158 - 185) * pct * 2);
    return `rgb(16, ${g}, 129)`;
  } else {
    const r = Math.round(245 + (239 - 245) * (pct - 0.5) * 2);
    return `rgb(${r}, ${Math.round(158 - 158 * (pct - 0.5) * 2)}, 11)`;
  }
}

function renderWorkoutPlan(plan) {
  const badge = document.getElementById('workout-badge');
  badge.textContent = plan.workoutType || 'Workout';
  badge.className = `workout-type-badge ${badgeClass(plan.workoutType)}`;

  document.getElementById('workout-duration').textContent = plan.duration ?? '—';

  const intensity = plan.intensity || '';
  const score = plan.intensityScore || 5;
  document.getElementById('intensity-label').textContent =
    `${intensity.charAt(0).toUpperCase() + intensity.slice(1)} (${score}/10)`;
  const fill = document.getElementById('intensity-fill');
  fill.style.width = `${(score / 10) * 100}%`;
  fill.style.background = intensityGradient(score);

  // Warnings
  const warnContainer = document.getElementById('warnings-container');
  warnContainer.innerHTML = '';
  (plan.warnings || []).forEach((w) => {
    const div = document.createElement('div');
    div.className = 'warning-box';
    div.textContent = w;
    warnContainer.appendChild(div);
  });

  // Exercises
  const tbody = document.getElementById('exercises-body');
  tbody.innerHTML = '';
  (plan.exercises || []).forEach((ex) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="exercise-name">${esc(ex.name)}</td>
      <td>${esc(ex.sets)}</td>
      <td>${esc(ex.reps)}</td>
      <td><span class="exercise-muscle">${esc(ex.muscleGroup)}</span></td>
      <td class="exercise-notes">${esc(ex.notes)}</td>
    `;
    tbody.appendChild(tr);
  });

  // Warmup
  const warmupList = document.getElementById('warmup-list');
  warmupList.innerHTML = '';
  (plan.warmup || []).forEach((w) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(w.name)}</span><span class="wc-dur">${esc(w.duration)}</span>`;
    warmupList.appendChild(li);
  });

  // Cooldown
  const cooldownList = document.getElementById('cooldown-list');
  cooldownList.innerHTML = '';
  (plan.cooldown || []).forEach((c) => {
    const li = document.createElement('li');
    li.innerHTML = `<span>${esc(c.name)}</span><span class="wc-dur">${esc(c.duration)}</span>`;
    cooldownList.appendChild(li);
  });

  document.getElementById('reasoning-box').textContent = plan.reasoning || '';
}

function renderAgentLogs(agentLogs) {
  const grid = document.getElementById('logs-grid');
  grid.innerHTML = '';
  if (!agentLogs) return;

  const labels = {
    sleep: '😴 Sleep Analysis',
    recovery: '💓 Recovery',
    activity: '🏃 Activity',
    workoutHistory: '📊 Workout History',
  };

  for (const [name, logs] of Object.entries(agentLogs)) {
    const card = document.createElement('div');
    card.className = 'log-agent-card';
    const entries = (logs || [])
      .filter((l) => !['start', 'complete'].includes(l.action))
      .slice(0, 5)
      .map((l) => `<div class="log-entry"><span class="log-action">${esc(l.action)}</span>: ${esc(l.detail)}</div>`)
      .join('');
    card.innerHTML = `<div class="log-agent-name">${esc(labels[name] || name)}</div>${entries || '<div class="log-entry">No events</div>'}`;
    grid.appendChild(card);
  }
}
