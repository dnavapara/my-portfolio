const { v4: uuidv4 } = require('uuid');

/**
 * In-memory employee store.
 * In production this would be backed by a database.
 */
const employees = new Map();

function createEmployee(data) {
  const id = uuidv4();
  const employee = {
    id,
    firstName: data.firstName,
    lastName: data.lastName,
    email: data.email || null,
    department: data.department || 'default',
    role: data.role || '',
    startDate: data.startDate || new Date().toISOString().split('T')[0],
    manager: data.manager || '',
    location: data.location || 'Remote',
    documents: [],
    accounts: [],
    hardware: [],
    tasks: [],
    policiesAcknowledged: [],
    completedTraining: [],
    buddy: null,
    onboardingPlan: null,
    createdAt: new Date().toISOString(),
  };
  employees.set(id, employee);
  return employee;
}

function getEmployee(id) {
  return employees.get(id) || null;
}

function getAllEmployees() {
  return Array.from(employees.values());
}

function updateEmployee(id, updates) {
  const emp = employees.get(id);
  if (!emp) return null;
  Object.assign(emp, updates);
  return emp;
}

function updateTaskStatus(employeeId, taskId, status) {
  const emp = employees.get(employeeId);
  if (!emp || !emp.onboardingPlan) return null;

  const task = emp.onboardingPlan.employee.tasks.find((t) => t.id === taskId);
  if (task) {
    task.status = status;
  }
  return task;
}

module.exports = {
  createEmployee,
  getEmployee,
  getAllEmployees,
  updateEmployee,
  updateTaskStatus,
};
