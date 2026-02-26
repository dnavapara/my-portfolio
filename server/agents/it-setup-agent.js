const BaseAgent = require('./base-agent');

/**
 * ITSetupAgent – provisions technology resources for new employees:
 *   • Email & messaging accounts
 *   • SSO / directory setup
 *   • Hardware provisioning
 *   • Software license assignment
 *   • VPN & security access
 */
class ITSetupAgent extends BaseAgent {
  constructor() {
    super('IT Setup Agent', 'Provisions technology accounts, hardware, and access');
    this.capabilities = [
      'email_provisioning',
      'account_creation',
      'hardware_request',
      'software_licenses',
      'security_access',
    ];
  }

  async perceive(context) {
    const { employee } = context;

    const roleProfiles = {
      engineering: {
        software: ['IDE License', 'GitHub Enterprise', 'Jira', 'Slack', 'AWS Console'],
        hardware: ['MacBook Pro 16"', 'External Monitor 27"', 'Mechanical Keyboard', 'USB-C Hub'],
        access: ['VPN', 'CI/CD Pipeline', 'Staging Servers', 'Code Repositories'],
      },
      design: {
        software: ['Figma Enterprise', 'Adobe Creative Suite', 'Slack', 'Jira'],
        hardware: ['MacBook Pro 16"', 'External Monitor 32" 4K', 'Wacom Tablet'],
        access: ['VPN', 'Design Asset Library', 'Brand Portal'],
      },
      product: {
        software: ['Jira', 'Confluence', 'Slack', 'Amplitude', 'Mixpanel'],
        hardware: ['MacBook Pro 14"', 'External Monitor 27"'],
        access: ['VPN', 'Analytics Dashboard', 'Customer Feedback Portal'],
      },
      sales: {
        software: ['Salesforce', 'Slack', 'Zoom Pro', 'DocuSign'],
        hardware: ['MacBook Air', 'External Monitor 24"'],
        access: ['VPN', 'CRM', 'Sales Playbook'],
      },
      default: {
        software: ['Slack', 'Google Workspace', 'Zoom'],
        hardware: ['Laptop', 'External Monitor 24"'],
        access: ['VPN', 'Company Intranet'],
      },
    };

    const department = (employee.department || 'default').toLowerCase();
    const profile = roleProfiles[department] || roleProfiles.default;

    context.itPerception = {
      profile,
      department,
      existingAccounts: employee.accounts || [],
      existingHardware: employee.hardware || [],
    };

    return context;
  }

  async decide(context) {
    const actions = [];
    const { profile, existingAccounts, existingHardware } = context.itPerception;
    const employee = context.employee;

    // Email account
    if (!employee.emailProvisioned) {
      actions.push({
        type: 'provision_email',
        email: `${employee.firstName?.toLowerCase()}.${employee.lastName?.toLowerCase()}@company.com`,
      });
    }

    // Software licenses
    const neededSoftware = profile.software.filter(
      (s) => !existingAccounts.includes(s)
    );
    if (neededSoftware.length > 0) {
      actions.push({ type: 'assign_software', software: neededSoftware });
    }

    // Hardware
    const neededHardware = profile.hardware.filter(
      (h) => !existingHardware.includes(h)
    );
    if (neededHardware.length > 0) {
      actions.push({ type: 'request_hardware', hardware: neededHardware });
    }

    // Security & access
    actions.push({ type: 'configure_access', access: profile.access });

    return actions;
  }

  async act(context, actions) {
    if (!context.employee.tasks) context.employee.tasks = [];

    for (const action of actions) {
      switch (action.type) {
        case 'provision_email': {
          context.employee.emailProvisioned = true;
          context.employee.email = action.email;
          context.employee.tasks.push({
            id: 'it-email-setup',
            agent: this.name,
            type: 'auto_provisioned',
            title: `Email provisioned: ${action.email}`,
            status: 'completed',
            priority: 'high',
            category: 'IT Accounts',
          });
          this.addLog('provision_email', `Created email: ${action.email}`);
          break;
        }

        case 'assign_software': {
          for (const sw of action.software) {
            context.employee.tasks.push({
              id: `it-sw-${sw.toLowerCase().replace(/\s+/g, '-')}`,
              agent: this.name,
              type: 'auto_provisioned',
              title: `License assigned: ${sw}`,
              status: 'completed',
              priority: 'medium',
              category: 'Software Licenses',
            });
          }
          context.employee.accounts = [
            ...(context.employee.accounts || []),
            ...action.software,
          ];
          this.addLog('assign_software', `Assigned ${action.software.length} licenses`);
          break;
        }

        case 'request_hardware': {
          for (const hw of action.hardware) {
            context.employee.tasks.push({
              id: `it-hw-${hw.toLowerCase().replace(/[\s"]+/g, '-')}`,
              agent: this.name,
              type: 'hardware_request',
              title: `Hardware: ${hw}`,
              status: 'in_progress',
              priority: 'high',
              dueInDays: 5,
              category: 'Hardware',
              note: 'Procurement order placed – shipping in progress',
            });
          }
          this.addLog('request_hardware', `Requested ${action.hardware.length} hardware items`);
          break;
        }

        case 'configure_access': {
          for (const acc of action.access) {
            context.employee.tasks.push({
              id: `it-access-${acc.toLowerCase().replace(/[\s/]+/g, '-')}`,
              agent: this.name,
              type: 'auto_provisioned',
              title: `Access granted: ${acc}`,
              status: 'completed',
              priority: 'high',
              category: 'Security & Access',
            });
          }
          this.addLog('configure_access', `Configured ${action.access.length} access grants`);
          break;
        }
      }
    }

    return context;
  }

  async reflect(context) {
    const itTasks = (context.employee.tasks || []).filter(
      (t) => t.agent === this.name
    );
    const auto = itTasks.filter((t) => t.type === 'auto_provisioned').length;
    const pending = itTasks.filter((t) => t.status !== 'completed').length;

    this.addLog(
      'reflect',
      `IT setup: ${auto} auto-provisioned, ${pending} awaiting fulfillment`
    );

    return { complete: true, context };
  }
}

module.exports = ITSetupAgent;
