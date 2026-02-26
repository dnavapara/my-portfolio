/**
 * AgentFlow – Frontend application for the Agentic AI Onboarding System.
 * Handles navigation, form submission, and result rendering.
 */

// ── Navigation ──────────────────────────────────────────────
function showView(viewName) {
  document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.remove('active'));

  document.getElementById(`view-${viewName}`).classList.add('active');
  const navBtn = document.querySelector(`.nav-btn[data-view="${viewName}"]`);
  if (navBtn) navBtn.classList.add('active');

  if (viewName === 'home') loadEmployees();
}

document.querySelectorAll('.nav-btn').forEach((btn) => {
  btn.addEventListener('click', () => showView(btn.dataset.view));
});

// ── Form Submission ─────────────────────────────────────────
document.getElementById('onboard-form').addEventListener('submit', async (e) => {
  e.preventDefault();

  const btn = document.getElementById('submit-btn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoading = btn.querySelector('.btn-loading');

  btnText.style.display = 'none';
  btnLoading.style.display = 'inline-flex';
  btn.disabled = true;

  const data = {
    firstName: document.getElementById('firstName').value,
    lastName: document.getElementById('lastName').value,
    department: document.getElementById('department').value,
    role: document.getElementById('role').value,
    startDate: document.getElementById('startDate').value,
    manager: document.getElementById('manager').value,
    location: document.getElementById('location').value,
  };

  try {
    const res = await fetch('/api/onboard', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await res.json();

    if (result.success) {
      renderResult(result);
      showView('result');
      e.target.reset();
    } else {
      alert('Error: ' + (result.error || 'Unknown error'));
    }
  } catch (err) {
    alert('Network error: ' + err.message);
  } finally {
    btnText.style.display = 'inline';
    btnLoading.style.display = 'none';
    btn.disabled = false;
  }
});

// ── Load Employees ──────────────────────────────────────────
async function loadEmployees() {
  try {
    const res = await fetch('/api/employees');
    const employees = await res.json();

    const listEl = document.getElementById('employee-list');

    if (employees.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">&#128101;</div>
          <p>No employees onboarded yet.</p>
          <button class="btn btn-primary" onclick="showView('new')">Onboard First Employee</button>
        </div>`;
      updateGlobalStats(0, 0, 0);
      return;
    }

    let totalTasks = 0;
    let totalCompleted = 0;

    listEl.innerHTML = employees
      .map((emp) => {
        totalTasks += emp.tasksTotal;
        totalCompleted += emp.tasksCompleted;
        const pct = emp.tasksTotal > 0 ? Math.round((emp.tasksCompleted / emp.tasksTotal) * 100) : 0;
        return `
        <div class="employee-card" onclick="loadEmployeeDetail('${emp.id}')">
          <div class="emp-info">
            <h3>${esc(emp.firstName)} ${esc(emp.lastName)}</h3>
            <div class="emp-meta">${esc(emp.role || emp.department)} &middot; Started ${emp.startDate}</div>
          </div>
          <div class="emp-progress">
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width:${pct}%"></div>
            </div>
            <span class="progress-text">${emp.tasksCompleted}/${emp.tasksTotal} tasks</span>
          </div>
          <div class="emp-arrow">&#8250;</div>
        </div>`;
      })
      .join('');

    updateGlobalStats(employees.length, totalTasks, totalCompleted);
  } catch (err) {
    console.error('Failed to load employees:', err);
  }
}

function updateGlobalStats(total, tasks, completed) {
  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-tasks').textContent = tasks;
  document.getElementById('stat-completed').textContent = completed;
}

// ── Load Employee Detail ────────────────────────────────────
async function loadEmployeeDetail(id) {
  try {
    const res = await fetch(`/api/employees/${id}`);
    const emp = await res.json();

    if (emp.onboardingPlan) {
      renderResult({ employeeId: id, plan: emp.onboardingPlan });
      showView('result');
    }
  } catch (err) {
    console.error('Failed to load employee:', err);
  }
}

// ── Render Onboarding Result ────────────────────────────────
function renderResult(result) {
  const { plan, employeeId } = result;
  const { summary, agentLogs, timeline, employee } = plan;

  const container = document.getElementById('result-content');

  // Status icons
  const statusIcon = (s) =>
    s === 'completed' ? '&#10003;' : s === 'in_progress' ? '&#9679;' : '&#9675;';

  // Agent CSS class mapping
  const agentClass = (name) => {
    if (name.includes('HR')) return 'hr';
    if (name.includes('IT')) return 'it';
    if (name.includes('Training')) return 'training';
    if (name.includes('Buddy')) return 'buddy';
    return 'hr';
  };

  // Agent summary cards
  const agentCards = Object.entries(agentLogs)
    .map(([key, logs]) => {
      const events = logs.filter(
        (l) => !['start', 'complete'].includes(l.action)
      );
      const dotClass = `agent-dot-${key === 'hr' ? 'hr' : key === 'it' ? 'it' : key === 'training' ? 'training' : 'buddy'}`;
      const name =
        key === 'hr' ? 'HR Agent' : key === 'it' ? 'IT Setup Agent' : key === 'training' ? 'Training Agent' : 'Buddy Agent';
      return `
      <div class="agent-card">
        <div class="agent-card-header">
          <div class="agent-dot ${dotClass}"></div>
          <h4>${name}</h4>
        </div>
        <ul>
          ${events.map((e) => `<li>${esc(e.detail)}</li>`).join('')}
        </ul>
      </div>`;
    })
    .join('');

  // Timeline sections
  const timelineOrder = ['Immediate', 'Day 1-3', 'Week 1', 'Week 2', 'Month 1', 'Month 2-3'];
  const timelineHTML = timelineOrder
    .filter((bucket) => timeline[bucket])
    .map(
      (bucket) => `
      <div class="timeline-bucket">
        <div class="timeline-bucket-header">${bucket}</div>
        <div class="task-list">
          ${timeline[bucket]
            .map(
              (task) => `
            <div class="task-item">
              <div class="task-status status-${task.status}" title="${task.status}">${statusIcon(task.status)}</div>
              <div class="task-title">${esc(task.title)}</div>
              <div class="task-category">${esc(task.category)}</div>
              <div class="task-agent agent-${agentClass(task.agent)}">${esc(task.agent)}</div>
            </div>`
            )
            .join('')}
        </div>
      </div>`
    )
    .join('');

  container.innerHTML = `
    <div class="result-header">
      <div>
        <button class="btn btn-outline" onclick="showView('home')" style="margin-bottom:16px">&larr; Back to Dashboard</button>
        <h2>${esc(summary.employeeName)}</h2>
        <div class="emp-dept">${esc(summary.department)}</div>
      </div>
    </div>

    <div class="result-stats">
      <div class="result-stat">
        <div class="num num-purple">${summary.totalTasks}</div>
        <div class="lbl">Total Tasks</div>
      </div>
      <div class="result-stat">
        <div class="num num-green">${summary.completed}</div>
        <div class="lbl">Auto-Completed</div>
      </div>
      <div class="result-stat">
        <div class="num num-blue">${summary.inProgress}</div>
        <div class="lbl">In Progress</div>
      </div>
      <div class="result-stat">
        <div class="num num-yellow">${summary.pending}</div>
        <div class="lbl">Pending</div>
      </div>
      <div class="result-stat">
        <div class="num" style="color: var(--orange)">${summary.orchestrationTimeMs}ms</div>
        <div class="lbl">Agent Runtime</div>
      </div>
    </div>

    <div class="section-header"><h2>Agent Execution Log</h2></div>
    <div class="agent-flow">${agentCards}</div>

    ${employee.buddy ? `
    <div class="section-header"><h2>Assigned Buddy</h2></div>
    <div class="agent-card" style="margin-bottom:32px">
      <div class="agent-card-header">
        <div class="agent-dot agent-dot-buddy"></div>
        <h4>${esc(employee.buddy.name)}</h4>
      </div>
      <ul>
        <li>Department: ${esc(employee.buddy.department)}</li>
        <li>Seniority: ${esc(employee.buddy.seniority)}</li>
        <li>Rating: ${employee.buddy.rating}/5.0</li>
      </ul>
    </div>` : ''}

    <div class="section-header"><h2>Onboarding Timeline</h2></div>
    <div class="timeline-section">${timelineHTML}</div>
  `;
}

// ── Utility ─────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  const el = document.createElement('span');
  el.textContent = str;
  return el.innerHTML;
}

// ── Init ────────────────────────────────────────────────────
loadEmployees();
