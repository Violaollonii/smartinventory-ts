import { BadRequestException } from '@nestjs/common';
import { fillMissingDays, resolveRange } from './reports.service';

describe('report date helpers', () => {
  const now = new Date('2026-11-11T15:30:00Z');

  it('defaults to the last 30 days, including today', () => {
    const { start, end } = resolveRange(undefined, undefined, now);

    expect(start.toISOString()).toBe('2026-10-13T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-12T00:00:00.000Z'); // exclusive
  });

  it('treats "to" as inclusive', () => {
    const { start, end } = resolveRange('2026-11-01', '2026-11-03', now);

    expect(start.toISOString()).toBe('2026-11-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-11-04T00:00:00.000Z');
  });

  it('rejects a range that ends before it starts', () => {
    expect(() => resolveRange('2026-11-05', '2026-11-01', now)).toThrow(BadRequestException);
  });

  it('rejects a range longer than a year', () => {
    expect(() => resolveRange('2024-01-01', '2026-11-01', now)).toThrow(BadRequestException);
  });

  it('fills days without sales with zeros', () => {
    const { start, end } = resolveRange('2026-11-01', '2026-11-03', now);
    const rows = [{ date: '2026-11-02', revenue: 50, salesCount: 2, unitsSold: 3 }];

    expect(fillMissingDays(rows, start, end)).toEqual([
      { date: '2026-11-01', revenue: 0, salesCount: 0, unitsSold: 0 },
      { date: '2026-11-02', revenue: 50, salesCount: 2, unitsSold: 3 },
      { date: '2026-11-03', revenue: 0, salesCount: 0, unitsSold: 0 },
    ]);
  });
});
