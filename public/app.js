// ── Navigation ───────────────────────────────────────────────────────────────
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
  document.getElementById(`view-${name}`).classList.add('active');
  const btn = document.querySelector(`.nav-item[data-view="${name}"]`);
  if (btn) btn.classList.add('active');
  const titles = { home: 'Dashboard', new: 'New Employee', result: 'Onboarding Plan' };
  document.getElementById('topbar-title').textContent = titles[name] || '';
  if (name === 'home') loadEmployees();
}

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ── Form ─────────────────────────────────────────────────────────────────────
document.getElementById('onboard-form').addEventListener('submit', async e => {
  e.preventDefault();
  const btn = document.getElementById('submit-btn');
  btn.querySelector('.btn-text').style.display = 'none';
  btn.querySelector('.btn-loading').style.display = 'inline-flex';
  btn.disabled = true;

  const payload = {
    firstName: document.getElementById('firstName').value.trim(),
    lastName:  document.getElementById('lastName').value.trim(),
    department: document.getElementById('department').value,
    role:      document.getElementById('role').value.trim(),
    startDate: document.getElementById('startDate').value,
    manager:   document.getElementById('manager').value.trim(),
    location:  document.getElementById('location').value,
  };

  try {
    const res = await fetch('/api/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await res.json();
    if (result.success) {
      renderResult(result);
      showView('result');
      e.target.reset();
    } else {
      alert('Error: ' + (result.error || 'Unknown'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  } finally {
    btn.querySelector('.btn-text').style.display = 'inline';
    btn.querySelector('.btn-loading').style.display = 'none';
    btn.disabled = false;
  }
});

// ── Load employees ────────────────────────────────────────────────────────────
async function loadEmployees() {
  try {
    const employees = await fetch('/api/employees').then(r => r.json());
    const listEl = document.getElementById('employee-list');
    let totalTasks = 0, totalCompleted = 0;

    if (!employees.length) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🧑‍💼</div>
          <p>No employees onboarded yet.</p>
          <button class="btn-primary" onclick="showView('new')">Onboard First Employee</button>
        </div>`;
      updateStats(0, 0, 0);
      return;
    }

    totalTasks = employees.reduce((s, e) => s + e.tasksTotal, 0);
    totalCompleted = employees.reduce((s, e) => s + e.tasksCompleted, 0);

    listEl.innerHTML = `<div class="employee-list-inner">${employees.map(emp => {
      const pct = emp.tasksTotal > 0 ? Math.round(emp.tasksCompleted / emp.tasksTotal * 100) : 0;
      const initials = (emp.firstName[0] + emp.lastName[0]).toUpperCase();
      return `
      <div class="employee-card" onclick="loadEmployeeDetail('${emp.id}')">
        <div class="emp-avatar">${initials}</div>
        <div>
          <div class="emp-name">${esc(emp.firstName)} ${esc(emp.lastName)}</div>
          <div class="emp-meta">${esc(emp.role || emp.department)} · Started ${emp.startDate || '—'}</div>
        </div>
        <div class="emp-progress-col">
          <div class="progress-bar-bg">
            <div class="progress-bar-fill" style="width:${pct}%"></div>
          </div>
          <div class="progress-text">${emp.tasksCompleted}/${emp.tasksTotal}</div>
        </div>
        <div class="emp-chevron">›</div>
      </div>`;
    }).join('')}</div>`;

    updateStats(employees.length, totalTasks, totalCompleted);
  } catch (err) {
    console.error(err);
  }
}

function updateStats(total, tasks, completed) {
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-tasks').textContent = tasks;
  document.getElementById('stat-completed').textContent = completed;
}

// ── Load detail ───────────────────────────────────────────────────────────────
async function loadEmployeeDetail(id) {
  const emp = await fetch(`/api/employees/${id}`).then(r => r.json());
  if (emp.onboardingPlan) {
    renderResult({ employeeId: id, plan: emp.onboardingPlan });
    showView('result');
  }
}

// ── Render result ─────────────────────────────────────────────────────────────
function renderResult({ plan, employeeId }) {
  const { summary, agentLogs, timeline, employee } = plan;

  const agentMeta = {
    hr:       { icon: '📋', label: 'HR Agent',       cls: 'hr' },
    it:       { icon: '💻', label: 'IT Setup Agent',  cls: 'it' },
    training: { icon: '🎓', label: 'Training Agent',  cls: 'training' },
    buddy:    { icon: '🤝', label: 'Buddy Agent',     cls: 'buddy' },
  };

  // Agent cards
  const agentCards = Object.entries(agentLogs).map(([key, logs]) => {
    const meta = agentMeta[key] || { icon: '🤖', label: key, cls: 'hr' };
    const events = logs.filter(l => !['start', 'complete'].includes(l.action));
    return `
    <div class="agent-result-card">
      <div class="arc-header">
        <div class="arc-icon arc-icon-${meta.cls}">${meta.icon}</div>
        <div>
          <div class="arc-title">${meta.label}</div>
          <div class="arc-subtitle">${events.length} actions</div>
        </div>
      </div>
      <ul class="arc-events">
        ${events.map(e => `<li>${esc(e.detail)}</li>`).join('')}
      </ul>
    </div>`;
  }).join('');

  // Timeline
  const bucketOrder = ['Immediate', 'Day 1-3', 'Week 1', 'Week 2', 'Month 1', 'Month 2-3'];
  const bucketIcons = { 'Immediate': '⚡', 'Day 1-3': '📅', 'Week 1': '📆', 'Week 2': '🗓', 'Month 1': '📌', 'Month 2-3': '🏁' };

  const timelineHTML = bucketOrder.filter(b => timeline[b]).map(bucket => {
    const tasks = timeline[bucket];
    return `
    <div class="timeline-bucket">
      <div class="timeline-bucket-header">
        ${bucketIcons[bucket] || '📋'} ${bucket}
        <span class="bucket-count">${tasks.length}</span>
      </div>
      <div class="task-list">
        ${tasks.map(task => {
          const agentKey = task.agent?.includes('HR') ? 'hr' : task.agent?.includes('IT') ? 'it' : task.agent?.includes('Training') ? 'training' : 'buddy';
          const isDone = task.status === 'completed';
          const isActive = task.status === 'in_progress';
          const checkClass = isDone ? 'done' : isActive ? 'active' : '';
          const checkIcon = isDone ? '✓' : isActive ? '●' : '';
          return `
          <div class="task-item">
            <div class="task-checkbox ${checkClass}">${checkIcon}</div>
            <div class="task-title ${isDone ? 'done' : ''}">${esc(task.title)}</div>
            <div class="task-cat">${esc(task.category)}</div>
            <div class="task-agent-tag tag-${agentKey}">${esc(task.agent)}</div>
          </div>`;
        }).join('')}
      </div>
    </div>`;
  }).join('');

  // Buddy section
  const buddyHTML = employee.buddy ? `
    <div class="section-card" style="margin-bottom:24px">
      <div class="section-card-header"><h2>🤝 Assigned Buddy</h2></div>
      <div class="buddy-card" style="border:none;box-shadow:none;margin:0">
        <div class="buddy-avatar">${employee.buddy.name.split(' ').map(n=>n[0]).join('')}</div>
        <div>
          <div class="buddy-name">${esc(employee.buddy.name)}</div>
          <div class="buddy-meta">${esc(employee.buddy.department)} · ${esc(employee.buddy.seniority)}</div>
        </div>
        <div class="buddy-rating">⭐ ${employee.buddy.rating}</div>
      </div>
    </div>` : '';

  document.getElementById('result-content').innerHTML = `
    <button class="result-back-btn" onclick="showView('home')">← Back to Dashboard</button>

    <div class="result-hero">
      <div class="result-hero-left">
        <h2>${esc(summary.employeeName)}</h2>
        <div class="result-dept-badge">🏢 ${esc(summary.department)}</div>
      </div>
      <div class="result-stats-row">
        <div class="result-mini-stat">
          <div class="mn">${summary.totalTasks}</div>
          <div class="ml">Total Tasks</div>
        </div>
        <div class="result-mini-stat">
          <div class="mn" style="color:#86efac">${summary.completed}</div>
          <div class="ml">Auto-Done</div>
        </div>
        <div class="result-mini-stat">
          <div class="mn" style="color:#93c5fd">${summary.inProgress}</div>
          <div class="ml">In Progress</div>
        </div>
        <div class="result-mini-stat">
          <div class="mn" style="color:#fde68a">${summary.pending}</div>
          <div class="ml">Pending</div>
        </div>
        <div class="result-mini-stat">
          <div class="mn" style="color:#c4b5fd">${summary.orchestrationTimeMs}ms</div>
          <div class="ml">Agent Time</div>
        </div>
      </div>
    </div>

    <div class="section-card" style="margin-bottom:24px">
      <div class="section-card-header"><h2>🤖 Agent Execution</h2></div>
      <div class="agents-grid" style="padding:16px">${agentCards}</div>
    </div>

    ${buddyHTML}

    <div class="section-card">
      <div class="section-card-header"><h2>📅 Onboarding Timeline</h2></div>
      <div style="padding:16px">${timelineHTML}</div>
    </div>
  `;
}

// ── Util ──────────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = String(str);
  return el.innerHTML;
}

// ── Init ──────────────────────────────────────────────────────────────────────
loadEmployees();
