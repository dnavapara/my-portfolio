const BaseAgent = require('./base-agent');

/**
 * BuddyAgent – matches new hires with onboarding buddies/mentors:
 *   • Finds the best buddy match based on department and experience
 *   • Schedules introductory meetings
 *   • Sets up regular check-ins for the first 90 days
 */
class BuddyAgent extends BaseAgent {
  constructor() {
    super('Buddy Agent', 'Matches new hires with mentors and onboarding buddies');
    this.capabilities = [
      'buddy_matching',
      'mentor_assignment',
      'check_in_scheduling',
    ];

    // Simulated buddy pool
    this.buddyPool = [
      { id: 'b1', name: 'Sarah Chen', department: 'engineering', seniority: 'senior', rating: 4.9 },
      { id: 'b2', name: 'Marcus Johnson', department: 'engineering', seniority: 'lead', rating: 4.8 },
      { id: 'b3', name: 'Priya Patel', department: 'design', seniority: 'senior', rating: 4.9 },
      { id: 'b4', name: 'Alex Rivera', department: 'product', seniority: 'senior', rating: 4.7 },
      { id: 'b5', name: 'Jordan Kim', department: 'sales', seniority: 'lead', rating: 4.8 },
      { id: 'b6', name: 'Emily Thompson', department: 'engineering', seniority: 'staff', rating: 5.0 },
      { id: 'b7', name: 'David O\'Brien', department: 'product', seniority: 'director', rating: 4.6 },
      { id: 'b8', name: 'Lisa Nakamura', department: 'design', seniority: 'lead', rating: 4.9 },
    ];
  }

  async perceive(context) {
    const { employee } = context;
    const department = (employee.department || '').toLowerCase();

    // Score buddies: same department = +3, adjacent department = +1, rating as tiebreaker
    const scored = this.buddyPool.map((buddy) => {
      let score = buddy.rating;
      if (buddy.department === department) score += 3;
      return { ...buddy, score };
    });

    scored.sort((a, b) => b.score - a.score);

    context.buddyPerception = {
      candidates: scored.slice(0, 3),
      alreadyAssigned: !!employee.buddy,
    };

    return context;
  }

  async decide(context) {
    const actions = [];

    if (!context.buddyPerception.alreadyAssigned) {
      actions.push({
        type: 'assign_buddy',
        buddy: context.buddyPerception.candidates[0],
      });
    }

    if (!context.employee.checkInsScheduled) {
      actions.push({ type: 'schedule_check_ins' });
    }

    return actions;
  }

  async act(context, actions) {
    if (!context.employee.tasks) context.employee.tasks = [];

    for (const action of actions) {
      switch (action.type) {
        case 'assign_buddy': {
          context.employee.buddy = action.buddy;
          context.employee.tasks.push({
            id: 'buddy-intro-meeting',
            agent: this.name,
            type: 'meeting',
            title: `Meet your buddy: ${action.buddy.name}`,
            status: 'pending',
            priority: 'high',
            dueInDays: 2,
            category: 'Buddy Program',
            note: `${action.buddy.name} (${action.buddy.department}, ${action.buddy.seniority}) will be your onboarding buddy for the first 90 days`,
          });
          this.addLog('assign_buddy', `Matched with buddy: ${action.buddy.name}`);
          break;
        }

        case 'schedule_check_ins': {
          context.employee.checkInsScheduled = true;

          const checkIns = [
            { day: 7, title: 'Week 1 Check-in with Buddy' },
            { day: 14, title: 'Week 2 Check-in with Buddy' },
            { day: 30, title: 'Day 30 Review with Buddy & Manager' },
            { day: 60, title: 'Day 60 Mid-Point Review' },
            { day: 90, title: 'Day 90 Final Onboarding Review' },
          ];

          for (const ci of checkIns) {
            context.employee.tasks.push({
              id: `buddy-checkin-day${ci.day}`,
              agent: this.name,
              type: 'check_in',
              title: ci.title,
              status: 'pending',
              priority: ci.day <= 14 ? 'medium' : 'low',
              dueInDays: ci.day,
              category: 'Buddy Program',
            });
          }

          this.addLog('schedule_check_ins', 'Scheduled 5 check-ins over 90 days');
          break;
        }
      }
    }

    return context;
  }

  async reflect(context) {
    const buddy = context.employee.buddy;
    this.addLog(
      'reflect',
      buddy
        ? `Buddy assigned: ${buddy.name} (score: ${buddy.score?.toFixed(1)})`
        : 'No buddy assignment needed'
    );

    return { complete: true, context };
  }
}

module.exports = BuddyAgent;
