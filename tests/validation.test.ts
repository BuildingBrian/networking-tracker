import { describe, expect, it } from 'vitest';

import {
  PRIORITIES,
  contactInputSchema,
  contactUpdateSchema,
  validate,
} from '@/lib/validation';

/**
 * These are the rubric's required automated validation tests. They run against
 * the exact same schema the API route handlers use, so a pass here means the
 * server rejects the same input the same way.
 */

const VALID = {
  name: 'Jordan Lee',
  company: 'Genentech',
  role: 'Product Manager',
  where_met: 'Haas career fair',
  notes: 'Follow up in October.',
  priority: 'medium' as const,
};

describe('contact validation — name', () => {
  it('rejects an empty name with a clear message', () => {
    const result = validate(contactInputSchema, { ...VALID, name: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBe('Name is required.');
  });

  it('rejects a name that is only whitespace', () => {
    const result = validate(contactInputSchema, { ...VALID, name: '     ' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBe('Name is required.');
  });

  it('rejects a missing name', () => {
    const withoutName: Record<string, unknown> = { ...VALID };
    delete withoutName.name;
    const result = validate(contactInputSchema, withoutName);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBeDefined();
  });

  it('rejects a name longer than 200 characters', () => {
    const result = validate(contactInputSchema, { ...VALID, name: 'a'.repeat(201) });

    expect(result.ok).toBe(false);
  });

  it('trims surrounding whitespace from an otherwise valid name', () => {
    const result = validate(contactInputSchema, { ...VALID, name: '  Jordan Lee  ' });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.name).toBe('Jordan Lee');
  });
});

describe('contact validation — priority', () => {
  it.each(PRIORITIES)('accepts the valid priority "%s"', (priority) => {
    const result = validate(contactInputSchema, { ...VALID, priority });

    expect(result.ok).toBe(true);
  });

  it('rejects a priority outside high / medium / low', () => {
    const result = validate(contactInputSchema, { ...VALID, priority: 'urgent' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.priority).toBe('Priority must be one of: high, medium, low.');
  });

  it('rejects a priority in the wrong case', () => {
    const result = validate(contactInputSchema, { ...VALID, priority: 'HIGH' });

    expect(result.ok).toBe(false);
  });

  it('rejects a missing priority', () => {
    const withoutPriority: Record<string, unknown> = { ...VALID };
    delete withoutPriority.priority;
    const result = validate(contactInputSchema, withoutPriority);

    expect(result.ok).toBe(false);
  });
});

describe('contact validation — optional fields', () => {
  it('accepts a contact with only a name and a priority', () => {
    const result = validate(contactInputSchema, { name: 'Sam Rivera', priority: 'high' });

    expect(result.ok).toBe(true);
  });

  it('normalises blank optional fields to null rather than empty strings', () => {
    const result = validate(contactInputSchema, {
      name: 'Sam Rivera',
      priority: 'low',
      company: '   ',
      notes: '',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.company).toBeNull();
    expect(result.data.notes).toBeNull();
  });
});

describe('contact validation — updates', () => {
  it('accepts a partial update of a single field', () => {
    const result = validate(contactUpdateSchema, { priority: 'high' });

    expect(result.ok).toBe(true);
  });

  it('still rejects an explicitly empty name on update', () => {
    const result = validate(contactUpdateSchema, { name: '' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.name).toBe('Name is required.');
  });

  it('still rejects an invalid priority on update', () => {
    const result = validate(contactUpdateSchema, { priority: 'someday' });

    expect(result.ok).toBe(false);
  });

  it('rejects an empty update payload', () => {
    const result = validate(contactUpdateSchema, {});

    expect(result.ok).toBe(false);
  });
});

describe('validate() error shape', () => {
  it('returns a human-readable top-level message the API can pass straight through', () => {
    const result = validate(contactInputSchema, { name: '', priority: 'nope' });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(typeof result.message).toBe('string');
    expect(result.message.length).toBeGreaterThan(0);
    expect(Object.keys(result.errors).sort()).toEqual(['name', 'priority']);
  });
});
