const fs = require('fs');
const { XMLParser } = require('fast-xml-parser');

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const SLEEP_ASLEEP_VALUES = new Set([
  'HKCategoryValueSleepAnalysisAsleep',
  'HKCategoryValueSleepAnalysisAsleepCore',
  'HKCategoryValueSleepAnalysisAsleepDeep',
  'HKCategoryValueSleepAnalysisAsleepREM',
]);

const SLEEP_DEEP_VALUES = new Set([
  'HKCategoryValueSleepAnalysisAsleepDeep',
]);

const SLEEP_REM_VALUES = new Set([
  'HKCategoryValueSleepAnalysisAsleepREM',
]);

function mapWorkoutToMuscleGroup(hkType) {
  const map = {
    HKWorkoutActivityTypeRunning: 'cardio',
    HKWorkoutActivityTypeWalking: 'cardio',
    HKWorkoutActivityTypeCycling: 'cardio',
    HKWorkoutActivityTypeSwimming: 'cardio',
    HKWorkoutActivityTypeElliptical: 'cardio',
    HKWorkoutActivityTypeRowing: 'cardio',
    HKWorkoutActivityTypeStairClimbing: 'cardio',
    HKWorkoutActivityTypeTraditionalStrengthTraining: 'full_body',
    HKWorkoutActivityTypeFunctionalStrengthTraining: 'full_body',
    HKWorkoutActivityTypeCrossTraining: 'full_body',
    HKWorkoutActivityTypeHighIntensityIntervalTraining: 'full_body',
    HKWorkoutActivityTypeYoga: 'flexibility',
    HKWorkoutActivityTypePilates: 'flexibility',
    HKWorkoutActivityTypeFlexibility: 'flexibility',
    HKWorkoutActivityTypeBoxing: 'upper_body',
    HKWorkoutActivityTypeMartialArts: 'full_body',
    HKWorkoutActivityTypeSoccer: 'lower_body',
    HKWorkoutActivityTypeBasketball: 'full_body',
    HKWorkoutActivityTypeTennis: 'upper_body',
  };
  return map[hkType] || 'full_body';
}

function groupSleepRecords(records) {
  if (!records || records.length === 0) return [];

  const sorted = [...records].sort(
    (a, b) => new Date(a.startDate) - new Date(b.startDate)
  );

  const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
  const nights = [];
  let currentNight = null;

  for (const rec of sorted) {
    const start = new Date(rec.startDate).getTime();
    const end = new Date(rec.endDate).getTime();
    const durationMins = (end - start) / 60000;

    if (!currentNight || start - currentNight.lastEnd > SIX_HOURS_MS) {
      if (currentNight) nights.push(currentNight);
      currentNight = {
        date: rec.startDate.slice(0, 10),
        totalAsleepMins: 0,
        deepMins: 0,
        remMins: 0,
        coreMins: 0,
        firstStart: start,
        lastEnd: end,
      };
    }

    currentNight.lastEnd = Math.max(currentNight.lastEnd, end);

    if (SLEEP_ASLEEP_VALUES.has(rec.value)) {
      currentNight.totalAsleepMins += durationMins;
    }
    if (SLEEP_DEEP_VALUES.has(rec.value)) {
      currentNight.deepMins += durationMins;
    }
    if (SLEEP_REM_VALUES.has(rec.value)) {
      currentNight.remMins += durationMins;
    }
    if (rec.value === 'HKCategoryValueSleepAnalysisAsleepCore') {
      currentNight.coreMins += durationMins;
    }
  }

  if (currentNight) nights.push(currentNight);

  return nights.map((n) => ({
    date: n.date,
    totalAsleepMins: Math.round(n.totalAsleepMins),
    deepMins: Math.round(n.deepMins),
    remMins: Math.round(n.remMins),
    coreMins: Math.round(n.coreMins),
    inBedMins: Math.round((n.lastEnd - n.firstStart) / 60000),
  }));
}

async function parseAppleHealthFile(filePath) {
  const cutoff = Date.now() - THIRTY_DAYS_MS;

  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    isArray: (tagName) => ['Record', 'Workout'].includes(tagName),
    parseAttributeValue: true,
  });

  const buffer = await fs.promises.readFile(filePath);
  const parsed = parser.parse(buffer);

  const allRecords = parsed?.HealthData?.Record || [];
  const allWorkouts = parsed?.HealthData?.Workout || [];

  const recentRecords = allRecords.filter((r) => {
    const d = new Date(r['@_startDate']);
    return d.getTime() >= cutoff;
  });

  const recentWorkouts = allWorkouts.filter((w) => {
    const d = new Date(w['@_startDate']);
    return d.getTime() >= cutoff;
  });

  const sleep = groupSleepRecords(
    recentRecords
      .filter((r) => r['@_type'] === 'HKCategoryTypeIdentifierSleepAnalysis')
      .map((r) => ({
        startDate: r['@_startDate'],
        endDate: r['@_endDate'],
        value: r['@_value'],
      }))
  );

  const hrv = recentRecords
    .filter((r) => r['@_type'] === 'HKQuantityTypeIdentifierHeartRateVariabilitySDNN')
    .map((r) => ({ date: String(r['@_startDate']).slice(0, 10), value: Number(r['@_value']) }));

  const restingHR = recentRecords
    .filter((r) => r['@_type'] === 'HKQuantityTypeIdentifierRestingHeartRate')
    .map((r) => ({ date: String(r['@_startDate']).slice(0, 10), value: Number(r['@_value']) }));

  const steps = recentRecords
    .filter((r) => r['@_type'] === 'HKQuantityTypeIdentifierStepCount')
    .map((r) => ({ date: String(r['@_startDate']).slice(0, 10), value: Number(r['@_value']) }));

  const calories = recentRecords
    .filter((r) => r['@_type'] === 'HKQuantityTypeIdentifierActiveEnergyBurned')
    .map((r) => ({ date: String(r['@_startDate']).slice(0, 10), value: Number(r['@_value']) }));

  const exerciseTime = recentRecords
    .filter((r) => r['@_type'] === 'HKQuantityTypeIdentifierAppleExerciseTime')
    .map((r) => ({ date: String(r['@_startDate']).slice(0, 10), value: Number(r['@_value']) }));

  const workouts = recentWorkouts.map((w) => ({
    type: w['@_workoutActivityType'],
    durationMinutes: Math.round(Number(w['@_duration'])),
    calories: Math.round(Number(w['@_totalEnergyBurned']) || 0),
    startDate: String(w['@_startDate']).slice(0, 10),
    muscleGroup: mapWorkoutToMuscleGroup(w['@_workoutActivityType']),
  }));

  return { sleep, hrv, restingHR, steps, calories, exerciseTime, workouts };
}

function generateDemoData() {
  const today = new Date();
  const dayStr = (daysAgo) => {
    const d = new Date(today);
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().slice(0, 10);
  };

  // Seeded variation for realism
  const vary = (base, range) => Math.round(base + (Math.random() * range * 2 - range));

  const sleep = [];
  for (let i = 7; i >= 1; i--) {
    const asleep = vary(420, 40); // ~7h base
    const deep = vary(80, 20);
    const rem = vary(105, 25);
    sleep.push({
      date: dayStr(i),
      totalAsleepMins: Math.max(asleep, 240),
      deepMins: Math.max(deep, 20),
      remMins: Math.max(rem, 40),
      coreMins: vary(200, 30),
      inBedMins: Math.max(asleep + vary(25, 10), 260),
    });
  }

  const hrv = [];
  for (let i = 7; i >= 0; i--) {
    hrv.push({ date: dayStr(i), value: vary(65, 10) });
  }

  const restingHR = [];
  for (let i = 7; i >= 0; i--) {
    restingHR.push({ date: dayStr(i), value: vary(58, 4) });
  }

  const steps = [];
  for (let i = 7; i >= 0; i--) {
    steps.push({ date: dayStr(i), value: vary(8000, 2500) });
  }

  const calories = [];
  for (let i = 7; i >= 0; i--) {
    calories.push({ date: dayStr(i), value: vary(350, 80) });
  }

  const exerciseTime = [];
  for (let i = 7; i >= 0; i--) {
    exerciseTime.push({ date: dayStr(i), value: vary(28, 15) });
  }

  // 14 days of workouts — roughly every other day, cardio-heavy so Claude suggests strength
  const workoutTypes = [
    { type: 'HKWorkoutActivityTypeRunning', durationMinutes: 35, calories: 320, muscleGroup: 'cardio' },
    { type: 'HKWorkoutActivityTypeCycling', durationMinutes: 45, calories: 280, muscleGroup: 'cardio' },
    { type: 'HKWorkoutActivityTypeTraditionalStrengthTraining', durationMinutes: 50, calories: 240, muscleGroup: 'full_body' },
    { type: 'HKWorkoutActivityTypeRunning', durationMinutes: 30, calories: 290, muscleGroup: 'cardio' },
    { type: 'HKWorkoutActivityTypeYoga', durationMinutes: 40, calories: 130, muscleGroup: 'flexibility' },
    { type: 'HKWorkoutActivityTypeRunning', durationMinutes: 40, calories: 360, muscleGroup: 'cardio' },
    { type: 'HKWorkoutActivityTypeCycling', durationMinutes: 60, calories: 400, muscleGroup: 'cardio' },
  ];

  const workouts = [];
  const workoutDays = [1, 3, 5, 7, 9, 11, 13];
  workoutDays.forEach((daysAgo, idx) => {
    const base = workoutTypes[idx % workoutTypes.length];
    workouts.push({
      ...base,
      startDate: dayStr(daysAgo),
      durationMinutes: vary(base.durationMinutes, 8),
      calories: vary(base.calories, 30),
    });
  });

  return { sleep, hrv, restingHR, steps, calories, exerciseTime, workouts };
}

module.exports = { parseAppleHealthFile, generateDemoData, mapWorkoutToMuscleGroup };
