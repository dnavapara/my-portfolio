/**
 * BaseAgent - Foundation for all onboarding agents.
 *
 * Each agent follows a ReAct-style loop:
 *   Perceive → Decide → Act → Reflect
 *
 * Agents communicate through an event bus and share state via
 * the central onboarding context object.
 */
class BaseAgent {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.capabilities = [];
    this.status = 'idle'; // idle | running | completed | error
    this.log = [];
  }

  /** Record a structured log entry for observability. */
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

  /**
   * Perceive – gather information relevant to the current context.
   * Override in subclasses.
   */
  async perceive(context) {
    return context;
  }

  /**
   * Decide – determine the next set of actions based on perception.
   * Override in subclasses.
   */
  async decide(context) {
    return [];
  }

  /**
   * Act – execute the decided actions, mutating context as needed.
   * Override in subclasses.
   */
  async act(context, actions) {
    return context;
  }

  /**
   * Reflect – evaluate the outcome of actions and decide whether
   * to continue the loop or hand off.
   * Override in subclasses.
   */
  async reflect(context) {
    return { complete: true, context };
  }

  /** Main agent execution loop (ReAct pattern). */
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
