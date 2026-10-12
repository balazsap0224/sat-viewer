import { describe, expect, it } from 'vitest';
import { viewOffsetFor } from './viewInsets';

describe('viewOffsetFor', () => {
  it('nothing covered: no offset', () => {
    expect(viewOffsetFor({ top: 0, bottom: 0, left: 0, right: 0 })).toEqual({ x: 0, y: 0 });
  });

  it('a sheet over the bottom slides the picture up by half its height, less half the top bar', () => {
    // 50 px bar on top, 500 px of sheet and time bar below: the free strip's centre is
    // (500 − 50) / 2 = 225 px above the window's centre, so the cut-out moves 225 px down.
    expect(viewOffsetFor({ top: 50, bottom: 500, left: 0, right: 0 })).toEqual({ x: 0, y: 225 });
  });

  it('a column on the left slides the picture right', () => {
    expect(viewOffsetFor({ top: 0, bottom: 0, left: 330, right: 0 })).toEqual({ x: -165, y: 0 });
  });
});
