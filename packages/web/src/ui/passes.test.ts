import { degToRad } from '@sat-viewer/core';
import { describe, expect, it } from 'vitest';
import { parseLocation } from '../state/observer';
import { compass } from './PassesPanel';

describe('passes panel helpers', () => {
  it('compass points, 45° each, north wrapping round', () => {
    expect([0, 44, 46, 90, 180, 270, 337, 338, 359].map((d) => compass(degToRad(d)))).toEqual([
      'N',
      'NE',
      'NE',
      'E',
      'S',
      'W',
      'NW',
      'N',
      'N',
    ]);
  });

  it('typed locations: decimal comma allowed, out-of-range or empty rejected', () => {
    expect(parseLocation('47,4979', ' 19.0402 ')).toEqual({
      latDeg: 47.4979,
      lonDeg: 19.0402,
      altKm: 0,
    });
    expect(parseLocation('91', '0')).toBeNull();
    expect(parseLocation('0', '-181')).toBeNull();
    expect(parseLocation('', '10')).toBeNull();
    expect(parseLocation('abc', '10')).toBeNull();
  });
});
