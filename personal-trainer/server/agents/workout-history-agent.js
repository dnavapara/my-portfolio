const BaseAgent = require('./base-agent');

class WorkoutHistoryAgent extends BaseAgent {
  constructor() {
    super('Workout History Agent', 'Detects training patterns and overtraining risk');
  }

  async perceive(context) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 14);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const workouts = (context.healthData.workouts || [])
      .filter((w) => w.startDate >= cutoffStr)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));

    // Build a set of days with workouts
    const workoutDays = new Set(workouts.map((w) => w.startDate));

    // Count consecutive days ending today
    let consecutiveDays = 0;
    const today = new Date();
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      if (workoutDays.has(d.toISOString().slice(0, 10))) {
        consecutiveDays++;
      } else {
        break;
      }
    }

    context.historyPerception = { workouts, workoutDays, consecutiveDays };
    this.addLog('perceive', `${workouts.length} workouts in last 14 days, ${consecutiveDays} consecutive`);
    return context;
  }

  async decide(context) {
    return [{ type: 'analyze_history' }];
  }

  async act(context, actions) {
    const { workouts, workoutDays, consecutiveDays } = context.historyPerception;
    const flags = [];

    // Muscle group frequency
    const muscleGroupFrequency = {};
    for (const w of workouts) {
      const mg = w.muscleGroup || 'full_body';
      muscleGroupFrequency[mg] = (muscleGroupFrequency[mg] || 0) + 1;
    }

    // Rest days in 14-day window
    const restDays = 14 - workoutDays.size;
    const restRatio = restDays / 14;

    if (restRatio < 0.3) flags.push('Insufficient rest days');

    // Overtraining risk
    let overtTrainingRisk = 'none';
    if (consecutiveDays >= 6) {
      overtTrainingRisk = 'high';
      flags.push('High overtraining risk — 6+ consecutive training days');
    } else if (consecutiveDays >= 4) {
      overtTrainingRisk = 'moderate';
      flags.push('Moderate overtraining risk — 4+ consecutive days');
    } else if (consecutiveDays >= 2) {
      overtTrainingRisk = 'low';
    }

    // Intensity trend (calories per minute as proxy)
    const withIntensity = workouts.filter((w) => w.durationMinutes > 0);
    let intensityTrend = 'stable';
    if (withIntensity.length >= 5) {
      const recent = withIntensity.slice(-3);
      const older = withIntensity.slice(0, -3);
      const recentIntensity = recent.reduce((s, w) => s + w.calories / w.durationMinutes, 0) / recent.length;
      const olderIntensity = older.reduce((s, w) => s + w.calories / w.durationMinutes, 0) / older.length;
      if (recentIntensity > olderIntensity * 1.2) intensityTrend = 'increasing';
      else if (recentIntensity < olderIntensity * 0.8) intensityTrend = 'tapering';
    }

    // Last workout
    const lastWorkout = workouts.length > 0 ? workouts[workouts.length - 1] : null;
    const today = new Date().toISOString().slice(0, 10);
    let daysSinceLastWorkout = null;
    if (lastWorkout) {
      const diffMs = new Date(today) - new Date(lastWorkout.startDate);
      daysSinceLastWorkout = Math.round(diffMs / 86400000);
    }

    // Suggest the least-trained muscle group
    const allGroups = ['cardio', 'full_body', 'upper_body', 'lower_body', 'flexibility', 'core'];
    const suggestedFocus = allGroups.reduce((least, g) =>
      (muscleGroupFrequency[g] || 0) < (muscleGroupFrequency[least] || 0) ? g : least
    , allGroups[0]);

    context.workoutHistory = {
      totalWorkouts: workouts.length,
      restDays,
      consecutiveDays,
      muscleGroupFrequency,
      lastWorkout,
      daysSinceLastWorkout,
      intensityTrend,
      overtTrainingRisk,
      suggestedFocus,
      flags,
    };

    this.addLog('act', `${workouts.length} workouts, risk: ${overtTrainingRisk}, suggest: ${suggestedFocus}`);
    return context;
  }

  async reflect(context) {
    this.addLog('reflect', `Overtraining risk: ${context.workoutHistory?.overtTrainingRisk}`);
    return { complete: true, context };
  }
}

module.exports = WorkoutHistoryAgent;
