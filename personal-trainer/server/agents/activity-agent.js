const BaseAgent = require('./base-agent');

function sumByDate(records) {
  const map = {};
  for (const r of records) {
    map[r.date] = (map[r.date] || 0) + r.value;
  }
  return map;
}

function avg(values) {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

class ActivityAgent extends BaseAgent {
  constructor() {
    super('Activity Agent', 'Analyzes daily movement patterns and training load');
  }

  async perceive(context) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 7);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const filter = (arr) => (arr || []).filter((r) => r.date >= cutoffStr);

    const stepsMap = sumByDate(filter(context.healthData.steps));
    const calsMap = sumByDate(filter(context.healthData.calories));
    const exTimeMap = sumByDate(filter(context.healthData.exerciseTime));

    context.activityPerception = { stepsMap, calsMap, exTimeMap };
    this.addLog('perceive', `Steps days: ${Object.keys(stepsMap).length}, Calories days: ${Object.keys(calsMap).length}`);
    return context;
  }

  async decide(context) {
    return [{ type: 'calculate_activity_load' }];
  }

  async act(context, actions) {
    const { stepsMap, calsMap, exTimeMap } = context.activityPerception;

    const stepsVals = Object.values(stepsMap);
    const calsVals = Object.values(calsMap);
    const exTimeVals = Object.values(exTimeMap);

    const avgSteps = avg(stepsVals);
    const avgCals = avg(calsVals);
    const avgEx = avg(exTimeVals);

    // Today's values (most recent date present)
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const todaySteps = stepsMap[todayStr] ?? stepsMap[yesterdayStr] ?? 0;
    const todayCals = calsMap[todayStr] ?? calsMap[yesterdayStr] ?? 0;

    const flags = [];

    // Steps score (40 pts)
    let stepsScore;
    if (avgSteps >= 12000) stepsScore = 40;
    else if (avgSteps >= 10000) stepsScore = 35;
    else if (avgSteps >= 7000) stepsScore = 28;
    else if (avgSteps >= 5000) stepsScore = 20;
    else { stepsScore = 12; flags.push('Low daily step count'); }

    // Calories score (30 pts)
    let calsScore;
    if (avgCals >= 500) calsScore = 30;
    else if (avgCals >= 400) calsScore = 26;
    else if (avgCals >= 300) calsScore = 20;
    else if (avgCals >= 200) calsScore = 14;
    else { calsScore = 8; flags.push('Low active calorie burn'); }

    // Exercise time score (30 pts)
    let exScore;
    if (avgEx >= 45) exScore = 30;
    else if (avgEx >= 30) exScore = 26;
    else if (avgEx >= 20) exScore = 18;
    else if (avgEx >= 10) exScore = 12;
    else { exScore = 6; flags.push('Low daily exercise time'); }

    const load = Math.min(100, stepsScore + calsScore + exScore);

    // Trend (compare last 3 days vs prior 4 days for steps)
    const allDates = Object.keys(stepsMap).sort();
    let activityTrend = 'stable';
    if (allDates.length >= 6) {
      const recentAvg = avg(allDates.slice(-3).map((d) => stepsMap[d]));
      const olderAvg = avg(allDates.slice(0, 3).map((d) => stepsMap[d]));
      if (recentAvg > olderAvg * 1.15) activityTrend = 'increasing';
      else if (recentAvg < olderAvg * 0.85) activityTrend = 'decreasing';
    }

    // vs 7-day avg
    const vsAvg = (val, base) => base > 0 ? Math.round(((val - base) / base) * 100) : 0;

    context.activityAnalysis = {
      load,
      avgDailySteps: Math.round(avgSteps),
      avgActiveCalories: Math.round(avgCals),
      avgExerciseMinutes: Math.round(avgEx),
      todaySteps: Math.round(todaySteps),
      todayCalories: Math.round(todayCals),
      vsSevenDayAvg: {
        steps: vsAvg(todaySteps, avgSteps),
        calories: vsAvg(todayCals, avgCals),
      },
      activityTrend,
      flags,
    };

    this.addLog('act', `Activity load: ${load}/100, trend: ${activityTrend}`);
    return context;
  }

  async reflect(context) {
    this.addLog('reflect', `Load ${context.activityAnalysis?.load}, avg steps ${context.activityAnalysis?.avgDailySteps}`);
    return { complete: true, context };
  }
}

module.exports = ActivityAgent;
