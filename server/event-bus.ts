import { EventEmitter } from 'events';
import { Timestamp } from 'firebase-admin/firestore';
import type { Task, Agent, Bug } from '@/lib/types';

/**
 * Event types supported by the event bus
 */
export type EventType =
  | 'task.created'
  | 'task.updated'
  | 'task.claimed'
  | 'task.completed'
  | 'task.failed'
  | 'bug.created'
  | 'bug.resolved'
  | 'agent.online'
  | 'agent.offline'
  | 'agent.busy'
  | 'agent.idle';

/**
 * Typed Event interface
 */
export interface Event<T = any> {
  type: string;
  payload: T;
  timestamp: Timestamp;
  source: string;
  id: string;
}

/**
 * In-process EventEmitter-based event bus
 */
class EventBus extends EventEmitter {
  private static instance: EventBus;

  private constructor() {
    super();
    // Set maximum listeners to avoid warnings
    this.setMaxListeners(50);
  }

  /**
   * Get the singleton instance
   */
  public static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Emit an event
   * @param type - Event type
   * @param payload - Event payload
   * @param source - Source collection (e.g., 'tasks', 'agents')
   * @param id - Document ID
   */
  public emitEvent<T>(
    type: EventType | string,
    payload: T,
    source: string,
    id: string
  ): boolean {
    const event: Event<T> = {
      type,
      payload,
      timestamp: Timestamp.now(),
      source,
      id
    };

    console.log(`[EventBus] Emitting event: ${type} from ${source}/${id}`);
    return this.emit(type, event);
  }

  /**
   * Listen for events with wildcard support
   * @param eventType - Event type to listen for (supports wildcards like 'task.*')
   * @param listener - Callback function
   * @returns Function to unsubscribe
   */
  public onWildcard(
    eventType: string,
    listener: (event: Event<any>) => void
  ): () => void {
    // Convert wildcard pattern to regex
    const pattern = eventType.replace(/\*/g, '.*');
    const regex = new RegExp(`^${pattern}$`);

    // Wrapper function to check if event matches pattern
    const wrapper = (event: Event<any>) => {
      if (regex.test(event.type)) {
        listener(event);
      }
    };

    // Listen to all events and filter
    this.on('*', wrapper as any);

    // Return unsubscribe function
    return () => {
      this.off('*', wrapper as any);
    };
  }

  /**
   * Listen for a specific event type
   * @param eventType - Exact event type
   * @param listener - Callback function
   * @returns Function to unsubscribe
   */
  public onEvent(
    eventType: EventType | string,
    listener: (event: Event<any>) => void
  ): () => void {
    this.on(eventType, listener as any);
    return () => {
      this.off(eventType, listener as any);
    };
  }

  /**
   * Emit task.created event
   */
  public emitTaskCreated(task: Task, taskId: string): boolean {
    return this.emitEvent('task.created', { task, taskId }, 'tasks', taskId);
  }

  /**
   * Emit task.updated event
   */
  public emitTaskUpdated(
    task: Task,
    previousData: Partial<Task>,
    taskId: string
  ): boolean {
    return this.emitEvent(
      'task.updated',
      { task, previousData, taskId },
      'tasks',
      taskId
    );
  }

  /**
   * Emit task.claimed event
   */
  public emitTaskClaimed(
    task: Task,
    agentId: string,
    taskId: string
  ): boolean {
    return this.emitEvent(
      'task.claimed',
      { task, agentId, taskId },
      'tasks',
      taskId
    );
  }

  /**
   * Emit task.completed event
   */
  public emitTaskCompleted(
    task: Task,
    taskId: string
  ): boolean {
    return this.emitEvent(
      'task.completed',
      { task, taskId },
      'tasks',
      taskId
    );
  }

  /**
   * Emit task.failed event
   */
  public emitTaskFailed(
    task: Task,
    taskId: string
  ): boolean {
    return this.emitEvent(
      'task.failed',
      { task, taskId },
      'tasks',
      taskId
    );
  }

  /**
   * Emit bug.created event
   */
  public emitBugCreated(bug: Bug, bugId: string): boolean {
    return this.emitEvent('bug.created', { bug, bugId }, 'bugs', bugId);
  }

  /**
   * Emit bug.resolved event
   */
  public emitBugResolved(bug: Bug, bugId: string, resolvedBy?: string): boolean {
    return this.emitEvent(
      'bug.resolved',
      { bug, bugId, resolvedBy },
      'bugs',
      bugId
    );
  }

  /**
   * Emit agent.online event
   */
  public emitAgentOnline(agent: Agent, agentId: string): boolean {
    return this.emitEvent(
      'agent.online',
      { agent, agentId },
      'agents',
      agentId
    );
  }

  /**
   * Emit agent.offline event
   */
  public emitAgentOffline(agent: Agent, agentId: string): boolean {
    return this.emitEvent(
      'agent.offline',
      { agent, agentId },
      'agents',
      agentId
    );
  }

  /**
   * Emit agent.busy event
   */
  public emitAgentBusy(agent: Agent, agentId: string): boolean {
    return this.emitEvent(
      'agent.busy',
      { agent, agentId },
      'agents',
      agentId
    );
  }

  /**
   * Emit agent.idle event
   */
  public emitAgentIdle(agent: Agent, agentId: string): boolean {
    return this.emitEvent(
      'agent.idle',
      { agent, agentId },
      'agents',
      agentId
    );
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance();
export default eventBus;