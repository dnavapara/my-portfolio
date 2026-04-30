class BaseAgent {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.capabilities = [];
    this.status = 'idle';
    this.log = [];
  }

  addLog(action, detail) {
    const entry = {
      timestamp: new Date().toISOString(),
      agent: this.name,
      action,
      detail,
    };
    this.log.push(entry);
    return entry;
  }

  async perceive(context) {
    return context;
  }

  async decide(context) {
    return [];
  }

  async act(context, actions) {
    return context;
  }

  async reflect(context) {
    return { complete: true, context };
  }

  async run(context) {
    this.status = 'running';
    this.addLog('start', `Agent ${this.name} starting`);

    try {
      const MAX_ITERATIONS = 5;
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const perceivedCtx = await this.perceive(context);
        const actions = await this.decide(perceivedCtx);

        if (actions.length === 0) {
          this.addLog('no-actions', 'No further actions required');
          break;
        }

        context = await this.act(perceivedCtx, actions);
        const reflection = await this.reflect(context);

        if (reflection.complete) {
          context = reflection.context;
          break;
        }
        context = reflection.context;
      }

      this.status = 'completed';
      this.addLog('complete', `Agent ${this.name} finished successfully`);
    } catch (err) {
      this.status = 'error';
      this.addLog('error', err.message);
      throw err;
    }

    return { context, log: this.log };
  }
}

module.exports = BaseAgent;
