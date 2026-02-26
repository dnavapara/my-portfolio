/**
 * ClfModel – Classifier model for employee onboarding.
 *
 * Classifies new employees into onboarding tiers and risk levels based on
 * their profile attributes using a rule-based weighted scoring system.
 *
 * Tier classification:
 *   - 'executive'        → VP, Director, C-suite, or Head-of roles
 *   - 'technical'        → Engineering, Data, DevOps, or similar departments
 *   - 'remote-intensive' → Remote/hybrid employees in non-technical roles
 *   - 'standard'         → All other employees
 *
 * Risk classification:
 *   - 'high'   → Critical profile data missing or very short lead time
 *   - 'medium' → Some data missing or short lead time
 *   - 'low'    → Profile is complete with sufficient lead time
 */
class ClfModel {
  constructor() {
    this.version = '1.0.0';

    this._executiveKeywords = [
      'ceo', 'cto', 'coo', 'cfo', 'ciso',
      'vp', 'vice president',
      'director', 'head of', 'chief',
      'president', 'partner', 'principal',
    ];

    this._technicalDepts = [
      'engineering', 'data', 'devops', 'platform',
      'infrastructure', 'ml', 'ai', 'security',
      'sre', 'backend', 'frontend', 'fullstack',
    ];

    this._tierBaseDays = {
      executive: 60,
      technical: 45,
      'remote-intensive': 35,
      standard: 30,
    };

    this._tierBaseIntensity = {
      executive: 4,
      technical: 4,
      'remote-intensive': 3,
      standard: 2,
    };
  }

  /**
   * Classify an employee and return a full classification result.
   *
   * @param {object} employee - Employee data object
   * @returns {object} Classification result
   */
  classify(employee) {
    const tier = this._classifyTier(employee);
    const riskLevel = this._classifyRisk(employee);
    const onboardingIntensity = this._scoreIntensity(tier, riskLevel);
    const estimatedCompletionDays = this._estimateDays(tier, onboardingIntensity);
    const focusAreas = this._determineFocusAreas(tier, riskLevel, employee);
    const confidence = this._computeConfidence(employee);

    return {
      tier,
      riskLevel,
      onboardingIntensity,
      estimatedCompletionDays,
      focusAreas,
      confidence,
      classifiedAt: new Date().toISOString(),
      modelVersion: this.version,
    };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _classifyTier(employee) {
    const role = (employee.role || '').toLowerCase();
    const department = (employee.department || '').toLowerCase();
    const location = (employee.location || '').toLowerCase();

    if (this._executiveKeywords.some((kw) => role.includes(kw))) {
      return 'executive';
    }

    if (this._technicalDepts.some((d) => department.includes(d))) {
      return 'technical';
    }

    if (location === 'remote' || location === 'hybrid') {
      return 'remote-intensive';
    }

    return 'standard';
  }

  /**
   * Compute a risk score and map it to a risk level.
   *
   * Risk factors:
   *   +2  email missing
   *   +2  role missing
   *   +2  department missing
   *   +1  manager missing
   *   +1  location missing
   *   +3  start date already passed
   *   +2  start date within 3 days
   *   +1  start date within 7 days
   *   +1  start date not provided
   */
  _classifyRisk(employee) {
    let score = 0;

    if (!employee.email) score += 2;
    if (!employee.role) score += 2;
    if (!employee.department) score += 2;
    if (!employee.manager) score += 1;
    if (!employee.location) score += 1;

    if (employee.startDate) {
      const leadDays = this._leadDays(employee.startDate);
      if (leadDays < 0) score += 3;
      else if (leadDays < 3) score += 2;
      else if (leadDays < 7) score += 1;
    } else {
      score += 1;
    }

    if (score >= 5) return 'high';
    if (score >= 2) return 'medium';
    return 'low';
  }

  /** Onboarding intensity on a 1–5 scale. */
  _scoreIntensity(tier, riskLevel) {
    const base = this._tierBaseIntensity[tier] ?? 2;
    const riskBonus = riskLevel === 'high' ? 1 : 0;
    return Math.min(5, base + riskBonus);
  }

  /** Estimated days to complete onboarding. */
  _estimateDays(tier, intensity) {
    const base = this._tierBaseDays[tier] ?? 30;
    return base + (intensity - 2) * 5;
  }

  /** Ordered list of recommended focus areas for this employee. */
  _determineFocusAreas(tier, riskLevel, employee) {
    const areas = [];

    // High-risk employees always need docs and provisioning first
    if (riskLevel === 'high') {
      areas.push('document-collection', 'account-provisioning');
    }

    switch (tier) {
      case 'executive':
        areas.push('strategic-alignment', 'stakeholder-meetings', 'leadership-integration');
        break;
      case 'technical':
        areas.push('system-access', 'technical-training', 'code-review-process');
        break;
      case 'remote-intensive':
        areas.push('communication-setup', 'buddy-program', 'async-workflows');
        break;
      default:
        areas.push('company-culture', 'team-integration', 'tools-training');
    }

    if (riskLevel === 'medium') areas.push('document-collection');
    if (!employee.manager) areas.push('manager-assignment');

    // Deduplicate while preserving order
    return [...new Set(areas)];
  }

  /**
   * Confidence score (0–100) based on profile completeness.
   * Higher completeness → higher confidence in the classification.
   */
  _computeConfidence(employee) {
    const scoredFields = [
      { field: 'firstName', weight: 1 },
      { field: 'lastName', weight: 1 },
      { field: 'department', weight: 2 },
      { field: 'role', weight: 2 },
      { field: 'location', weight: 1 },
      { field: 'startDate', weight: 1 },
      { field: 'manager', weight: 1 },
      { field: 'email', weight: 1 },
    ];

    const totalWeight = scoredFields.reduce((s, f) => s + f.weight, 0);
    const earnedWeight = scoredFields
      .filter((f) => employee[f.field])
      .reduce((s, f) => s + f.weight, 0);

    return Math.round((earnedWeight / totalWeight) * 100);
  }

  /** Days between today and a given date string (negative if in the past). */
  _leadDays(dateStr) {
    const start = new Date(dateStr);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.floor((start - today) / (1000 * 60 * 60 * 24));
  }
}

module.exports = new ClfModel();
