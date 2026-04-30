const BaseAgent = require('./base-agent');

class RecoveryAgent extends BaseAgent {
  constructor() {
    super('Recovery Agent', 'Evaluates HRV and resting heart rate trends for readiness');
  }

  async perceive(context) {
    const hrv = (context.healthData.hrv || []).slice(-8).sort((a, b) => a.date.localeCompare(b.date));
    const rhr = (context.healthData.restingHR || []).slice(-8).sort((a, b) => a.date.localeCompare(b.date));

    const baseline = (arr) => arr.slice(0, -1).reduce((s, r) => s + r.value, 0) / Math.max(arr.slice(0, -1).length, 1);

    context.recoveryPerception = {
      todayHRV: hrv.length > 0 ? hrv[hrv.length - 1].value : null,
      baselineHRV: hrv.length > 1 ? baseline(hrv) : null,
      todayRHR: rhr.length > 0 ? rhr[rhr.length - 1].value : null,
      baselineRHR: rhr.length > 1 ? baseline(rhr) : null,
      hrvHistory: hrv,
      rhrHistory: rhr,
    };

    this.addLog('perceive', `HRV today=${context.recoveryPerception.todayHRV}ms, RHR today=${context.recoveryPerception.todayRHR}bpm`);
    return context;
  }

  async decide(context) {
    return [{ type: 'calculate_readiness' }];
  }

  async act(context, actions) {
    const { todayHRV, baselineHRV, todayRHR, baselineRHR, hrvHistory, rhrHistory } = context.recoveryPerception;
    const flags = [];

    // HRV component (50 pts)
    let hrvScore = 35; // default if no data
    if (todayHRV !== null && baselineHRV !== null && baselineHRV > 0) {
      const pctDiff = (todayHRV - baselineHRV) / baselineHRV;
      if (pctDiff > 0.2) hrvScore = 50;
      else if (pctDiff > 0.1) hrvScore = 45;
      else if (pctDiff >= -0.1) hrvScore = 40;
      else if (pctDiff >= -0.2) hrvScore = 30;
      else if (pctDiff >= -0.3) hrvScore = 20;
      else { hrvScore = 10; flags.push('HRV significantly suppressed'); }
    } else {
      flags.push('Limited HRV data');
    }

    // Resting HR component (50 pts)
    let rhrScore = 35; // default if no data
    if (todayRHR !== null && baselineRHR !== null) {
      const diff = todayRHR - baselineRHR;
      if (diff < -5) rhrScore = 50;
      else if (diff <= 0) rhrScore = 45;
      else if (diff <= 3) rhrScore = 35;
      else if (diff <= 7) { rhrScore = 25; flags.push('Elevated resting HR'); }
      else { rhrScore = 15; flags.push('Significantly elevated resting HR'); }
    } else {
      flags.push('Limited resting HR data');
    }

    const score = Math.min(100, hrvScore + rhrScore);

    // Recommendation
    let recommendation;
    if (score >= 80) recommendation = 'full_training';
    else if (score >= 65) recommendation = 'moderate';
    else if (score >= 50) recommendation = 'recovery_day';
    else recommendation = 'rest';

    // HRV trend
    let hrvTrend = 'stable';
    if (hrvHistory.length >= 4) {
      const recent = hrvHistory.slice(-2).reduce((s, r) => s + r.value, 0) / 2;
      const older = hrvHistory.slice(0, 2).reduce((s, r) => s + r.value, 0) / 2;
      if (recent > older + 3) hrvTrend = 'improving';
      else if (recent < older - 3) hrvTrend = 'declining';
    }

    context.recoveryAnalysis = {
      score,
      todayHRV,
      baselineHRV: baselineHRV ? Math.round(baselineHRV * 10) / 10 : null,
      todayRestingHR: todayRHR,
      baselineRestingHR: baselineRHR ? Math.round(baselineRHR * 10) / 10 : null,
      hrvTrend,
      recommendation,
      isLowRecovery: score < 50,
      flags,
    };

    this.addLog('act', `Readiness score: ${score}/100 — ${recommendation}`);
    return context;
  }

  async reflect(context) {
    this.addLog('reflect', `Recommendation: ${context.recoveryAnalysis?.recommendation}`);
    return { complete: true, context };
  }
}

module.exports = RecoveryAgent;
