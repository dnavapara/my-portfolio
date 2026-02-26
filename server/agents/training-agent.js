const BaseAgent = require('./base-agent');

/**
 * TrainingAgent – builds and assigns a personalized learning path:
 *   • Required company-wide training
 *   • Role-specific technical training
 *   • Compliance and safety modules
 *   • Mentorship sessions
 */
class TrainingAgent extends BaseAgent {
  constructor() {
    super('Training Agent', 'Creates personalized learning paths and tracks progress');
    this.capabilities = [
      'learning_path_generation',
      'module_assignment',
      'progress_tracking',
      'certification_management',
    ];
  }

  async perceive(context) {
    const { employee } = context;

    const companyWideModules = [
      { id: 'company-overview', title: 'Company Overview & Mission', duration: '45 min', type: 'video' },
      { id: 'security-awareness', title: 'Security Awareness Training', duration: '30 min', type: 'interactive' },
      { id: 'dei-training', title: 'Diversity, Equity & Inclusion', duration: '60 min', type: 'workshop' },
      { id: 'tools-intro', title: 'Internal Tools & Systems Overview', duration: '90 min', type: 'hands-on' },
    ];

    const roleModules = {
      engineering: [
        { id: 'eng-architecture', title: 'System Architecture Deep Dive', duration: '120 min', type: 'hands-on' },
        { id: 'eng-git-workflow', title: 'Git Workflow & Code Review Process', duration: '60 min', type: 'hands-on' },
        { id: 'eng-ci-cd', title: 'CI/CD Pipeline Walkthrough', duration: '45 min', type: 'video' },
        { id: 'eng-oncall', title: 'On-Call Procedures & Incident Response', duration: '60 min', type: 'interactive' },
      ],
      design: [
        { id: 'des-system', title: 'Design System & Brand Guidelines', duration: '90 min', type: 'workshop' },
        { id: 'des-research', title: 'User Research Methods', duration: '60 min', type: 'video' },
        { id: 'des-accessibility', title: 'Accessibility Standards (WCAG)', duration: '45 min', type: 'interactive' },
      ],
      product: [
        { id: 'pm-roadmap', title: 'Product Roadmap & Strategy', duration: '90 min', type: 'workshop' },
        { id: 'pm-analytics', title: 'Analytics & Data-Driven Decisions', duration: '60 min', type: 'hands-on' },
        { id: 'pm-customer', title: 'Customer Journey Mapping', duration: '45 min', type: 'interactive' },
      ],
      sales: [
        { id: 'sales-product', title: 'Product Knowledge Bootcamp', duration: '120 min', type: 'workshop' },
        { id: 'sales-crm', title: 'CRM & Sales Tools Training', duration: '60 min', type: 'hands-on' },
        { id: 'sales-pitch', title: 'Sales Pitch & Demo Skills', duration: '90 min', type: 'workshop' },
      ],
      default: [],
    };

    const department = (employee.department || 'default').toLowerCase();
    const rolePath = roleModules[department] || roleModules.default;

    context.trainingPerception = {
      companyWideModules,
      roleModules: rolePath,
      completedModules: employee.completedTraining || [],
      department,
    };

    return context;
  }

  async decide(context) {
    const actions = [];
    const { companyWideModules, roleModules, completedModules } = context.trainingPerception;

    const allModules = [...companyWideModules, ...roleModules];
    const pendingModules = allModules.filter(
      (m) => !completedModules.includes(m.id)
    );

    if (pendingModules.length > 0) {
      actions.push({ type: 'assign_modules', modules: pendingModules });
    }

    // Schedule 1:1 with manager
    if (!context.employee.managerMeetingScheduled) {
      actions.push({ type: 'schedule_manager_meeting' });
    }

    // Schedule team introduction
    if (!context.employee.teamIntroScheduled) {
      actions.push({ type: 'schedule_team_intro' });
    }

    return actions;
  }

  async act(context, actions) {
    if (!context.employee.tasks) context.employee.tasks = [];

    for (const action of actions) {
      switch (action.type) {
        case 'assign_modules': {
          const weekOne = action.modules.slice(0, 4);
          const weekTwo = action.modules.slice(4);

          for (const mod of weekOne) {
            context.employee.tasks.push({
              id: `training-${mod.id}`,
              agent: this.name,
              type: 'training_module',
              title: `${mod.title}`,
              status: 'pending',
              priority: 'high',
              dueInDays: 7,
              category: 'Week 1 Training',
              metadata: { duration: mod.duration, format: mod.type },
            });
          }
          for (const mod of weekTwo) {
            context.employee.tasks.push({
              id: `training-${mod.id}`,
              agent: this.name,
              type: 'training_module',
              title: `${mod.title}`,
              status: 'pending',
              priority: 'medium',
              dueInDays: 14,
              category: 'Week 2 Training',
            metadata: { duration: mod.duration, format: mod.type },
            });
          }

          this.addLog('assign_modules', `Assigned ${action.modules.length} training modules`);
          break;
        }

        case 'schedule_manager_meeting': {
          context.employee.managerMeetingScheduled = true;
          context.employee.tasks.push({
            id: 'training-manager-1on1',
            agent: this.name,
            type: 'meeting',
            title: '1:1 Meeting with Manager',
            status: 'pending',
            priority: 'high',
            dueInDays: 2,
            category: 'Meetings',
            note: 'Introductory 1:1 – discuss role expectations, goals, and questions',
          });
          this.addLog('schedule_meeting', 'Scheduled manager 1:1');
          break;
        }

        case 'schedule_team_intro': {
          context.employee.teamIntroScheduled = true;
          context.employee.tasks.push({
            id: 'training-team-intro',
            agent: this.name,
            type: 'meeting',
            title: 'Team Introduction Session',
            status: 'pending',
            priority: 'medium',
            dueInDays: 3,
            category: 'Meetings',
            note: 'Meet the team – informal introduction and Q&A',
          });
          this.addLog('schedule_meeting', 'Scheduled team introduction');
          break;
        }
      }
    }

    return context;
  }

  async reflect(context) {
    const trainingTasks = (context.employee.tasks || []).filter(
      (t) => t.agent === this.name
    );
    const modules = trainingTasks.filter((t) => t.type === 'training_module').length;
    const meetings = trainingTasks.filter((t) => t.type === 'meeting').length;

    this.addLog(
      'reflect',
      `Training plan: ${modules} modules + ${meetings} meetings assigned`
    );

    return { complete: true, context };
  }
}

module.exports = TrainingAgent;
