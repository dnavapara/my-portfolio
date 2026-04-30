const Anthropic = require('@anthropic-ai/sdk');
const SleepAnalysisAgent = require('./sleep-analysis-agent');
const RecoveryAgent = require('./recovery-agent');
const ActivityAgent = require('./activity-agent');
const WorkoutHistoryAgent = require('./workout-history-agent');

const FALLBACK_PLAN = {
  workoutType: 'Active Recovery',
  duration: 30,
  intensity: 'low',
  intensityScore: 3,
  exercises: [
    { name: 'Cat-Cow Stretch', sets: 3, reps: '10 reps', muscleGroup: 'spine', notes: 'Move slowly, breathe through each rep' },
    { name: 'Hip Flexor Stretch', sets: 2, reps: '45 seconds each side', muscleGroup: 'hips', notes: 'Keep hips squared forward' },
    { name: 'Thread the Needle', sets: 2, reps: '8 reps each side', muscleGroup: 'thoracic spine', notes: 'Focus on rotation, not range' },
    { name: 'Glute Bridge Hold', sets: 3, reps: '30 seconds', muscleGroup: 'glutes', notes: 'Squeeze glutes at the top' },
    { name: 'Child\'s Pose', sets: 1, reps: '2 minutes', muscleGroup: 'full body', notes: 'Deep diaphragmatic breathing' },
  ],
  warmup: [
    { name: 'Light walking', duration: '5 minutes' },
    { name: 'Arm circles', duration: '1 minute' },
  ],
  cooldown: [
    { name: 'Seated forward fold', duration: '2 minutes' },
    { name: 'Supine twist each side', duration: '90 seconds' },
  ],
  reasoning: 'AI analysis was temporarily unavailable. A conservative active recovery session is recommended as a safe default that supports any recovery state.',
  warnings: ['AI analysis unavailable — defaulting to recovery protocol'],
};

class TrainerOrchestrator {
  constructor() {
    this.agents = {
      sleep: new SleepAnalysisAgent(),
      recovery: new RecoveryAgent(),
      activity: new ActivityAgent(),
      workoutHistory: new WorkoutHistoryAgent(),
    };
    this.anthropic = new Anthropic();
    this.sessionStatuses = new Map();
  }

  async generatePlan(healthData, sessionId) {
    const startTime = Date.now();

    this._updateStatus(sessionId, {
      sleep: 'running',
      recovery: 'running',
      activity: 'running',
      workoutHistory: 'running',
      claude: 'pending',
    });

    const makeCtx = () => ({ healthData: { ...healthData } });

    const results = await Promise.allSettled([
      this.agents.sleep.run(makeCtx()),
      this.agents.recovery.run(makeCtx()),
      this.agents.activity.run(makeCtx()),
      this.agents.workoutHistory.run(makeCtx()),
    ]);

    const agentNames = ['sleep', 'recovery', 'activity', 'workoutHistory'];
    const agentResults = {};
    const agentLogs = {};
    const statusUpdates = {};

    results.forEach((result, i) => {
      const name = agentNames[i];
      if (result.status === 'fulfilled') {
        agentResults[name] = result.value.context;
        agentLogs[name] = result.value.log;
        statusUpdates[name] = 'completed';
      } else {
        agentLogs[name] = [{ agent: name, action: 'error', detail: result.reason?.message }];
        statusUpdates[name] = 'error';
      }
    });

    this._updateStatus(sessionId, { ...statusUpdates, claude: 'running' });

    const metrics = {
      sleep: agentResults.sleep?.sleepAnalysis || null,
      recovery: agentResults.recovery?.recoveryAnalysis || null,
      activity: agentResults.activity?.activityAnalysis || null,
      history: agentResults.workoutHistory?.workoutHistory || null,
    };

    const workoutPlan = await this._callClaude(metrics);

    this._updateStatus(sessionId, { claude: 'completed' });

    return {
      workoutPlan,
      agentLogs,
      metrics,
      orchestrationTimeMs: Date.now() - startTime,
    };
  }

  async _callClaude(metrics) {
    try {
      const systemPrompt = `You are a certified personal trainer and sports scientist with expertise in periodization, recovery-based programming, and individualized training. You analyze biometric data from wearables and generate precise, safe, science-based workout recommendations. Always prioritize recovery when data indicates fatigue. Respond ONLY with valid JSON matching the exact schema provided — no markdown fences, no explanations outside the JSON.`;

      const s = metrics.sleep;
      const r = metrics.recovery;
      const a = metrics.activity;
      const h = metrics.history;

      const userPrompt = `Based on this athlete's biometric data from their Apple Watch and iPhone, generate a personalized workout recommendation for today.

## Sleep Analysis (Last 7 Nights)
- Sleep Score: ${s?.score ?? 'N/A'}/100
- Average Duration: ${s?.avgDuration ?? 'N/A'}
- Deep Sleep: ${s?.deepSleepPct != null ? s.deepSleepPct.toFixed(1) : 'N/A'}%
- REM Sleep: ${s?.remSleepPct != null ? s.remSleepPct.toFixed(1) : 'N/A'}%
- Sleep Debt: ${s?.sleepDebtHours != null ? s.sleepDebtHours.toFixed(1) : 'N/A'}h
- Trend: ${s?.trend ?? 'N/A'}
- Flags: ${s?.flags?.join(', ') || 'None'}

## Recovery & Readiness (HRV + Resting HR)
- Readiness Score: ${r?.score ?? 'N/A'}/100
- Today's HRV: ${r?.todayHRV ?? 'N/A'}ms (7-day baseline: ${r?.baselineHRV ?? 'N/A'}ms)
- Today's Resting HR: ${r?.todayRestingHR ?? 'N/A'}bpm (baseline: ${r?.baselineRestingHR ?? 'N/A'}bpm)
- HRV Trend: ${r?.hrvTrend ?? 'N/A'}
- Recovery Recommendation: ${r?.recommendation ?? 'N/A'}
- Flags: ${r?.flags?.join(', ') || 'None'}

## Daily Activity Load (Last 7 Days)
- Activity Load: ${a?.load ?? 'N/A'}/100
- Avg Daily Steps: ${a?.avgDailySteps?.toLocaleString() ?? 'N/A'}
- Avg Active Calories: ${a?.avgActiveCalories ?? 'N/A'} kcal/day
- Avg Exercise Time: ${a?.avgExerciseMinutes ?? 'N/A'} min/day
- Activity Trend: ${a?.activityTrend ?? 'N/A'}

## Workout History (Last 14 Days)
- Total Workouts: ${h?.totalWorkouts ?? 'N/A'}
- Rest Days: ${h?.restDays ?? 'N/A'}
- Current Consecutive Training Days: ${h?.consecutiveDays ?? 0}
- Overtraining Risk: ${h?.overtTrainingRisk ?? 'N/A'}
- Muscle Group Frequency: ${JSON.stringify(h?.muscleGroupFrequency ?? {})}
- Suggested Focus (least trained): ${h?.suggestedFocus ?? 'N/A'}
- Days Since Last Workout: ${h?.daysSinceLastWorkout ?? 'N/A'}
- Intensity Trend: ${h?.intensityTrend ?? 'N/A'}
- Flags: ${h?.flags?.join(', ') || 'None'}

## Required JSON Response Schema
{"workoutType":"string","duration":number,"intensity":"low"|"moderate"|"high","intensityScore":number,"exercises":[{"name":"string","sets":number,"reps":"string","muscleGroup":"string","notes":"string"}],"warmup":[{"name":"string","duration":"string"}],"cooldown":[{"name":"string","duration":"string"}],"reasoning":"string","warnings":["string"]}`;

      const message = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 2048,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const rawText = message.content[0].text.trim();
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in response');

      return JSON.parse(jsonMatch[0]);
    } catch (err) {
      console.error('Claude API error:', err.message);
      return { ...FALLBACK_PLAN, warnings: [`AI error: ${err.message}`, ...FALLBACK_PLAN.warnings] };
    }
  }

  _updateStatus(sessionId, updates) {
    const current = this.sessionStatuses.get(sessionId) || {
      sleep: 'pending',
      recovery: 'pending',
      activity: 'pending',
      workoutHistory: 'pending',
      claude: 'pending',
    };
    this.sessionStatuses.set(sessionId, { ...current, ...updates });
  }

  getAgentStatus(sessionId) {
    return this.sessionStatuses.get(sessionId) || null;
  }
}

module.exports = TrainerOrchestrator;
