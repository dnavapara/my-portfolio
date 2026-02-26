const BaseAgent = require('./base-agent');

/**
 * HRAgent – handles human-resources onboarding tasks:
 *   • Document collection (ID, tax forms, emergency contacts)
 *   • Policy acknowledgments
 *   • Benefits enrollment setup
 *   • Compliance training enrollment
 */
class HRAgent extends BaseAgent {
  constructor() {
    super('HR Agent', 'Manages HR documentation, policies, and compliance');
    this.capabilities = [
      'document_collection',
      'policy_acknowledgment',
      'benefits_enrollment',
      'compliance_check',
    ];
  }

  async perceive(context) {
    const { employee } = context;
    const missing = [];

    const requiredDocs = [
      { id: 'government_id', label: 'Government-issued ID' },
      { id: 'tax_w4', label: 'W-4 Tax Withholding Form' },
      { id: 'i9_form', label: 'I-9 Employment Eligibility' },
      { id: 'direct_deposit', label: 'Direct Deposit Authorization' },
      { id: 'emergency_contact', label: 'Emergency Contact Form' },
      { id: 'nda', label: 'Non-Disclosure Agreement' },
    ];

    const submitted = employee.documents || [];
    for (const doc of requiredDocs) {
      if (!submitted.find((d) => d.id === doc.id)) {
        missing.push(doc);
      }
    }

    context.hrPerception = { requiredDocs, missing, submitted };
    return context;
  }

  async decide(context) {
    const actions = [];
    const { missing } = context.hrPerception;

    if (missing.length > 0) {
      actions.push({
        type: 'request_documents',
        documents: missing,
      });
    }

    const policies = [
      'code_of_conduct',
      'data_privacy',
      'remote_work',
      'anti_harassment',
    ];
    const acknowledged = context.employee.policiesAcknowledged || [];
    const pendingPolicies = policies.filter((p) => !acknowledged.includes(p));

    if (pendingPolicies.length > 0) {
      actions.push({
        type: 'assign_policy_acknowledgments',
        policies: pendingPolicies,
      });
    }

    if (!context.employee.benefitsEnrollmentStarted) {
      actions.push({ type: 'initiate_benefits_enrollment' });
    }

    return actions;
  }

  async act(context, actions) {
    if (!context.employee.tasks) context.employee.tasks = [];

    for (const action of actions) {
      switch (action.type) {
        case 'request_documents':
          for (const doc of action.documents) {
            context.employee.tasks.push({
              id: `hr-doc-${doc.id}`,
              agent: this.name,
              type: 'document_upload',
              title: `Upload: ${doc.label}`,
              status: 'pending',
              priority: 'high',
              dueInDays: 3,
              category: 'HR Documents',
            });
          }
          this.addLog('request_documents', `Requested ${action.documents.length} documents`);
          break;

        case 'assign_policy_acknowledgments':
          for (const policy of action.policies) {
            const label = policy.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
            context.employee.tasks.push({
              id: `hr-policy-${policy}`,
              agent: this.name,
              type: 'policy_acknowledgment',
              title: `Acknowledge: ${label} Policy`,
              status: 'pending',
              priority: 'medium',
              dueInDays: 5,
              category: 'Policies',
            });
          }
          this.addLog('assign_policies', `Assigned ${action.policies.length} policy acknowledgments`);
          break;

        case 'initiate_benefits_enrollment':
          context.employee.benefitsEnrollmentStarted = true;
          context.employee.tasks.push({
            id: 'hr-benefits-enrollment',
            agent: this.name,
            type: 'benefits_enrollment',
            title: 'Complete Benefits Enrollment',
            status: 'pending',
            priority: 'medium',
            dueInDays: 14,
            category: 'Benefits',
          });
          this.addLog('benefits_enrollment', 'Initiated benefits enrollment');
          break;
      }
    }

    return context;
  }

  async reflect(context) {
    const hrTasks = (context.employee.tasks || []).filter(
      (t) => t.agent === this.name
    );
    const pendingCount = hrTasks.filter((t) => t.status === 'pending').length;

    this.addLog(
      'reflect',
      `HR onboarding: ${hrTasks.length} tasks created, ${pendingCount} pending`
    );

    return { complete: true, context };
  }
}

module.exports = HRAgent;
