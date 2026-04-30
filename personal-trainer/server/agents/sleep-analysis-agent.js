const BaseAgent = require('./base-agent');

class SleepAnalysisAgent extends BaseAgent {
  constructor() {
    super('Sleep Analysis Agent', 'Analyzes 7-night sleep patterns for quality and recovery');
  }

  async perceive(context) {
    const nights = (context.healthData.sleep || []).slice(-7);
    if (nights.length === 0) {
      context.sleepPerception = { nights: [], empty: true };
      return context;
    }

    const totalMins = nights.reduce((s, n) => s + n.totalAsleepMins, 0);
    const avgMins = totalMins / nights.length;
    const deepMins = nights.reduce((s, n) => s + n.deepMins, 0);
    const remMins = nights.reduce((s, n) => s + n.remMins, 0);
    const deepPct = totalMins > 0 ? (deepMins / totalMins) * 100 : 0;
    const remPct = totalMins > 0 ? (remMins / totalMins) * 100 : 0;

    const durations = nights.map((n) => n.totalAsleepMins);
    const maxDur = Math.max(...durations);
    const minDur = Math.min(...durations);
    const variance = maxDur - minDur;

    const TARGET_MINS = 8 * 60;
    const sleepDebtMins = Math.max(0, nights.length * TARGET_MINS - totalMins);

    context.sleepPerception = {
      nights,
      avgMins,
      deepPct,
      remPct,
      variance,
      sleepDebtHours: sleepDebtMins / 60,
      empty: false,
    };
    this.addLog('perceive', `Analyzed ${nights.length} nights, avg ${Math.round(avgMins)}min`);
    return context;
  }

  async decide(context) {
    return [{ type: 'calculate_sleep_score' }];
  }

  async act(context, actions) {
    if (context.sleepPerception.empty) {
      context.sleepAnalysis = {
        score: 50,
        avgDuration: 'N/A',
        avgDurationMins: 0,
        deepSleepPct: 0,
        remSleepPct: 0,
        sleepDebtHours: 0,
        nightCount: 0,
        trend: 'stable',
        flags: ['No sleep data available'],
      };
      return context;
    }

    const { avgMins, deepPct, remPct, variance, sleepDebtHours, nights } = context.sleepPerception;
    let score = 100;
    const flags = [];

    // Duration deductions
    const avgHours = avgMins / 60;
    if (avgHours < 7) {
      const deficit = (7 - avgHours) * 2; // -5 per 30min under = -10 per hour
      score -= Math.min(30, Math.round(deficit * 5));
      flags.push(`Short sleep avg (${avgHours.toFixed(1)}h)`);
    } else if (avgHours > 9) {
      score -= 3;
      flags.push('Oversleeping detected');
    }

    // Deep sleep
    if (deepPct < 10) {
      score -= 25;
      flags.push('Very low deep sleep');
    } else if (deepPct < 15) {
      score -= 15;
      flags.push('Low deep sleep');
    }

    // REM
    if (remPct < 20) {
      score -= 10;
      flags.push('Low REM sleep');
    }

    // Night-to-night variance
    if (variance > 90) {
      score -= 10;
      flags.push('Inconsistent sleep schedule');
    }

    // Sleep debt
    if (sleepDebtHours > 4) {
      score -= 10;
      flags.push(`High sleep debt (${sleepDebtHours.toFixed(1)}h)`);
    }

    score = Math.max(0, Math.min(100, score));

    // Trend: compare last 3 vs first 3 nights
    let trend = 'stable';
    if (nights.length >= 6) {
      const recentAvg = nights.slice(-3).reduce((s, n) => s + n.totalAsleepMins, 0) / 3;
      const olderAvg = nights.slice(0, 3).reduce((s, n) => s + n.totalAsleepMins, 0) / 3;
      if (recentAvg > olderAvg + 15) trend = 'improving';
      else if (recentAvg < olderAvg - 15) trend = 'declining';
    }

    const hrs = Math.floor(avgMins / 60);
    const mins = Math.round(avgMins % 60);

    context.sleepAnalysis = {
      score,
      avgDuration: `${hrs}h ${mins}m`,
      avgDurationMins: Math.round(avgMins),
      deepSleepPct: Math.round(deepPct * 10) / 10,
      remSleepPct: Math.round(remPct * 10) / 10,
      sleepDebtHours: Math.round(sleepDebtHours * 10) / 10,
      nightCount: nights.length,
      trend,
      flags,
    };

    this.addLog('act', `Sleep score: ${score}/100 — flags: ${flags.join(', ') || 'none'}`);
    return context;
  }

  async reflect(context) {
    this.addLog('reflect', `Score ${context.sleepAnalysis?.score}, trend: ${context.sleepAnalysis?.trend}`);
    return { complete: true, context };
  }
}

module.exports = SleepAnalysisAgent;
