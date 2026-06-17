/**
 * Action Types Unit Tests
 * Tests createActionStep, createActionSet, and Phase 4 action type definitions.
 */

import { describe, it, expect } from 'vitest';
import {
  createActionStep,
  createActionSet,
  type ActionStepType,
} from '../actionTypes';

// ==================== createActionStep ====================

describe('createActionStep', () => {
  it('creates an action step with correct type and params', () => {
    const step = createActionStep('adjust:brightness-contrast', { brightness: 10 });

    expect(step.type).toBe('adjust:brightness-contrast');
    expect(step.params).toEqual({ brightness: 10 });
  });

  it('generates a string id', () => {
    const step = createActionStep('filter:apply');

    expect(typeof step.id).toBe('string');
    expect(step.id.length).toBeGreaterThan(0);
  });

  it('generates a numeric timestamp', () => {
    const before = Date.now();
    const step = createActionStep('crop:apply');
    const after = Date.now();

    expect(typeof step.timestamp).toBe('number');
    expect(step.timestamp).toBeGreaterThanOrEqual(before);
    expect(step.timestamp).toBeLessThanOrEqual(after);
  });

  it('defaults params to empty object when omitted', () => {
    const step = createActionStep('layer:add');

    expect(step.params).toEqual({});
  });

  it('generates unique ids for separate calls', () => {
    const step1 = createActionStep('layer:add');
    const step2 = createActionStep('layer:add');

    expect(step1.id).not.toBe(step2.id);
  });
});

// ==================== createActionSet ====================

describe('createActionSet', () => {
  it('creates an action set with the given name', () => {
    const set = createActionSet('My Action');

    expect(set.name).toBe('My Action');
  });

  it('creates an action set with a string id', () => {
    const set = createActionSet('Test');

    expect(typeof set.id).toBe('string');
    expect(set.id.length).toBeGreaterThan(0);
  });

  it('sets createdAt and updatedAt timestamps', () => {
    const before = Date.now();
    const set = createActionSet('Test');
    const after = Date.now();

    expect(set.createdAt).toBeGreaterThanOrEqual(before);
    expect(set.createdAt).toBeLessThanOrEqual(after);
    expect(set.updatedAt).toBeGreaterThanOrEqual(before);
    expect(set.updatedAt).toBeLessThanOrEqual(after);
  });

  it('defaults to an empty steps array when omitted', () => {
    const set = createActionSet('Empty Set');

    expect(set.steps).toEqual([]);
    expect(set.steps.length).toBe(0);
  });

  it('accepts an explicit empty steps array', () => {
    const set = createActionSet('Empty', []);

    expect(set.steps).toEqual([]);
  });

  it('preserves step order with multiple steps', () => {
    const step1 = createActionStep('adjust:brightness-contrast', { brightness: 5 });
    const step2 = createActionStep('filter:apply', { filterType: 'blur' });
    const step3 = createActionStep('crop:apply', { x: 0, y: 0, w: 100, h: 100 });

    const set = createActionSet('Multi-step', [step1, step2, step3]);

    expect(set.steps).toHaveLength(3);
    expect(set.steps[0]).toBe(step1);
    expect(set.steps[1]).toBe(step2);
    expect(set.steps[2]).toBe(step3);
    expect(set.steps[0].type).toBe('adjust:brightness-contrast');
    expect(set.steps[1].type).toBe('filter:apply');
    expect(set.steps[2].type).toBe('crop:apply');
  });
});

// ==================== Phase 4 Action Types ====================

describe('Phase 4 ActionStepType values', () => {
  // Verify that Phase 4 types are accepted by the type system
  // by successfully creating steps with each type.

  const phase4Types: ActionStepType[] = [
    'file:export-as',
    'file:import-svg',
    'file:save-for-web',
    'batch:run-action',
    'batch:image-processor',
    'conditional:if-then',
  ];

  it.each(phase4Types)('accepts Phase 4 type "%s"', (actionType) => {
    const step = createActionStep(actionType, { test: true });

    expect(step.type).toBe(actionType);
    expect(step.id).toBeDefined();
    expect(step.timestamp).toBeDefined();
    expect(step.params).toEqual({ test: true });
  });

  it('file:export-as step includes export parameters', () => {
    const step = createActionStep('file:export-as', {
      format: 'png',
      quality: 90,
      path: '/tmp/output.png',
    });

    expect(step.type).toBe('file:export-as');
    expect(step.params.format).toBe('png');
    expect(step.params.quality).toBe(90);
  });

  it('batch:run-action step references another action set', () => {
    const step = createActionStep('batch:run-action', {
      actionSetId: 'action-123',
      folder: '/images',
    });

    expect(step.type).toBe('batch:run-action');
    expect(step.params.actionSetId).toBe('action-123');
  });

  it('conditional:if-then step includes condition and branches', () => {
    const step = createActionStep('conditional:if-then', {
      condition: 'width > 1920',
      thenAction: 'resize',
      elseAction: 'skip',
    });

    expect(step.type).toBe('conditional:if-then');
    expect(step.params.condition).toBe('width > 1920');
  });
});
