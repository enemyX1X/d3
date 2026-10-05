import { describe, expect, it } from 'vitest';
import { GET } from '../app/api/health/route';

describe('GET /api/health', () => {
  it('reports the web service without claiming the separate local agent is running', async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ ok: true, service: 'livia-web', localAgent: 'separate-process' });
  });
});
