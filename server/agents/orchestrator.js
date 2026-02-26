const HRAgent = require('./hr-agent');
const ITSetupAgent = require('./it-setup-agent');
const TrainingAgent = require('./training-agent');
const BuddyAgent = require('./buddy-agent');

/**
 * Orchestrator – the master agent that coordinates the entire onboarding
 * workflow by delegating to specialized sub-agents.
 *
 * Execution flow:
 *   1. Validate employee input data
 *   2. Run sub-agents in parallel where possible
 *   3. Aggregate results into a unified onboarding plan
 *   4. Generate a summary with timeline and next steps
 */
class Orchestrator {
  constructor() {
    this.agents = {
      hr: new HRAgent(),
      it: new ITSetupAgent(),
      training: new TrainingAgent(),
      buddy: new BuddyAgent(),
    };
  }

  /** Run all agents and produce a complete onboarding plan. */
  async onboard(employeeData) {
    const startTime = Date.now();
    const context = {
      employee: {
        ...employeeData,
        tasks: [],
        documents: employeeData.documents || [],
        accounts: employeeData.accounts || [],
        hardware: employeeData.hardware || [],
        onboardingStarted: new Date().toISOString(),
      },
    };

    const agentLogs = {};

    // Deep-copy employee for each agent so their task arrays are isolated.
    const copyFor = () => ({
      ...context,
      employee: { ...context.employee, tasks: [], accounts: [...context.employee.accounts], hardware: [...context.employee.hardware] },
    });

    // Run all agents concurrently — each gets its own isolated context.
    const results = await Promise.allSettled([
      this.agents.hr.run(copyFor()),
      this.agents.it.run(copyFor()),
      this.agents.training.run(copyFor()),
      this.agents.buddy.run(copyFor()),
    ]);

    // Merge task lists from each agent back into a single employee record
    const mergedTasks = [];
    const agentNames = ['hr', 'it', 'training', 'buddy'];

    results.forEach((result, i) => {
      const name = agentNames[i];
      if (result.status === 'fulfilled') {
        mergedTasks.push(...(result.value.context.employee.tasks || []));
        agentLogs[name] = result.value.log;

        // Preserve agent-specific flags
        Object.assign(context.employee, result.value.context.employee);
      } else {
        agentLogs[name] = [
          { agent: name, action: 'error', detail: result.reason?.message },
        ];
      }
    });

    context.employee.tasks = mergedTasks;

    // Build summary
    const summary = this.buildSummary(context, agentLogs, startTime);

    return {
      employee: context.employee,
      summary,
      agentLogs,
      timeline: this.buildTimeline(mergedTasks),
    };
  }

  buildSummary(context, agentLogs, startTime) {
    const tasks = context.employee.tasks;
    const completed = tasks.filter((t) => t.status === 'completed').length;
    const inProgress = tasks.filter((t) => t.status === 'in_progress').length;
    const pending = tasks.filter((t) => t.status === 'pending').length;
    const duration = Date.now() - startTime;

    const agentSummaries = {};
    for (const [name, logs] of Object.entries(agentLogs)) {
      agentSummaries[name] = {
        totalActions: logs.length,
        status: logs.some((l) => l.action === 'error') ? 'error' : 'success',
        keyEvents: logs
          .filter((l) => !['start', 'complete'].includes(l.action))
          .map((l) => l.detail),
      };
    }

    return {
      employeeName: `${context.employee.firstName} ${context.employee.lastName}`,
      department: context.employee.department,
      totalTasks: tasks.length,
      completed,
      inProgress,
      pending,
      orchestrationTimeMs: duration,
      agentSummaries,
    };
  }

  buildTimeline(tasks) {
    const timeline = {};
    for (const task of tasks) {
      const bucket = task.dueInDays
        ? task.dueInDays <= 3
          ? 'Day 1-3'
          : task.dueInDays <= 7
            ? 'Week 1'
            : task.dueInDays <= 14
              ? 'Week 2'
              : task.dueInDays <= 30
                ? 'Month 1'
                : 'Month 2-3'
        : 'Immediate';

      if (!timeline[bucket]) timeline[bucket] = [];
      timeline[bucket].push({
        title: task.title,
        category: task.category,
        status: task.status,
        agent: task.agent,
      });
    }

    return timeline;
  }
}

module.exports = Orchestrator;
