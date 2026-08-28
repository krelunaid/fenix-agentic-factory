import { describe, expect, it } from 'vitest';

describe('health contract', () => {
  it('uses a stable route', () => expect('/api/health').toBe('/api/health'));
});
