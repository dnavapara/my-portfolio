const express = require('express');
const router = express.Router();
const Orchestrator = require('../agents/orchestrator');
const clfModel = require('../models/clf');
const {
  createEmployee,
  getEmployee,
  getAllEmployees,
  updateTaskStatus,
} = require('../models/employee');

const orchestrator = new Orchestrator();

/**
 * POST /api/onboard
 * Start the onboarding process for a new employee.
 * Body: { firstName, lastName, department, role, startDate, manager, location }
 */
router.post('/onboard', async (req, res) => {
  try {
    const { firstName, lastName, department, role, startDate, manager, location } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ error: 'firstName and lastName are required' });
    }

    // Create employee record
    const employee = createEmployee({
      firstName,
      lastName,
      department,
      role,
      startDate,
      manager,
      location,
    });

    // Run the agentic onboarding orchestration
    const plan = await orchestrator.onboard(employee);

    // Persist the plan
    employee.onboardingPlan = plan;

    res.json({
      success: true,
      employeeId: employee.id,
      plan,
    });
  } catch (err) {
    console.error('Onboarding error:', err);
    res.status(500).json({ error: 'Onboarding orchestration failed', detail: err.message });
  }
});

/**
 * GET /api/employees
 * List all employees with onboarding status.
 */
router.get('/employees', (req, res) => {
  const employees = getAllEmployees().map((emp) => ({
    id: emp.id,
    firstName: emp.firstName,
    lastName: emp.lastName,
    department: emp.department,
    role: emp.role,
    startDate: emp.startDate,
    tasksTotal: emp.onboardingPlan?.summary?.totalTasks || 0,
    tasksCompleted: emp.onboardingPlan?.summary?.completed || 0,
    createdAt: emp.createdAt,
  }));
  res.json(employees);
});

/**
 * GET /api/employees/:id
 * Get full onboarding details for an employee.
 */
router.get('/employees/:id', (req, res) => {
  const emp = getEmployee(req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employee not found' });
  res.json(emp);
});

/**
 * PATCH /api/employees/:id/tasks/:taskId
 * Update a task status (e.g., mark as completed).
 * Body: { status: 'completed' | 'in_progress' | 'pending' }
 */
router.patch('/employees/:id/tasks/:taskId', (req, res) => {
  const { status } = req.body;
  if (!['pending', 'in_progress', 'completed'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const task = updateTaskStatus(req.params.id, req.params.taskId, status);
  if (!task) return res.status(404).json({ error: 'Employee or task not found' });

  // Recalculate summary counts
  const emp = getEmployee(req.params.id);
  if (emp?.onboardingPlan) {
    const tasks = emp.onboardingPlan.employee.tasks;
    emp.onboardingPlan.summary.completed = tasks.filter((t) => t.status === 'completed').length;
    emp.onboardingPlan.summary.inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    emp.onboardingPlan.summary.pending = tasks.filter((t) => t.status === 'pending').length;
  }

  res.json({ success: true, task });
});

/**
 * POST /api/classify
 * Classify an employee profile without starting full onboarding.
 * Useful for previewing the tier, risk level, and recommended focus areas.
 * Body: { firstName, lastName, department, role, startDate, manager, location, email }
 */
router.post('/classify', (req, res) => {
  const result = clfModel.classify(req.body);
  res.json(result);
});

module.exports = router;
