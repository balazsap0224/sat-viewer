// SGP4 propagation (SPEC.md 6.1): a thin wrapper around satellite.js, the standard
// JavaScript port of Vallado's SGP4/SDP4 code (Vallado et al., "Revisiting Spacetrack
// Report #3", AIAA 2006-6753).
//
// Why SGP4 and not a Kepler (two-body) propagator: CelesTrak's elements are *mean* elements
// fitted with SGP4's own force model: Earth's oblateness (J2, J3, J4), atmospheric drag
// through BSTAR, and for periods over 225 minutes (SDP4, "deep space") the Sun's and Moon's
// pull and resonances with Earth's gravity field. Fed to a two-body propagator they are
// wrong by tens of km within hours. See docs/orbit-notes.md.
//
// Output frame: TEME, km and km/s. SGP4 uses the WGS-72 constants internally; that is how the
// elements were fitted, so it must not be changed (SPEC.md 6.2).

import { json2satrec, type SatRec, SatRecError, sgp4 } from 'satellite.js';
import { julianDate, type UnixMs } from './time';
import { type Vec3, vec3 } from './vector';

/** Mean elements of one object, as CelesTrak publishes them (OMM field names and units). */
export interface MeanElements {
  readonly NORAD_CAT_ID: number;
  /** UTC, ISO 8601 without the time zone, e.g. "2026-10-11T04:13:59.875680" */
  readonly EPOCH: string;
  /** [rev/day] */
  readonly MEAN_MOTION: number;
  readonly ECCENTRICITY: number;
  /** [deg] */
  readonly INCLINATION: number;
  /** [deg] */
  readonly RA_OF_ASC_NODE: number;
  /** [deg] */
  readonly ARG_OF_PERICENTER: number;
  /** [deg] */
  readonly MEAN_ANOMALY: number;
  /** Drag term [1/Earth radii] */
  readonly BSTAR: number;
  /** First derivative of mean motion / 2 [rev/day²] (not used by SGP4, kept for completeness) */
  readonly MEAN_MOTION_DOT: number;
  /** Second derivative of mean motion / 6 [rev/day³] (not used by SGP4) */
  readonly MEAN_MOTION_DDOT: number;
}

export type { SatRec };

/** Initialises SGP4 for one object. Cheap enough to do for 20,000 objects once at load. */
export function satrecFromElements(el: MeanElements): SatRec {
  return json2satrec({
    OBJECT_NAME: '',
    OBJECT_ID: '',
    EPOCH: el.EPOCH,
    MEAN_MOTION: el.MEAN_MOTION,
    ECCENTRICITY: el.ECCENTRICITY,
    INCLINATION: el.INCLINATION,
    RA_OF_ASC_NODE: el.RA_OF_ASC_NODE,
    ARG_OF_PERICENTER: el.ARG_OF_PERICENTER,
    MEAN_ANOMALY: el.MEAN_ANOMALY,
    EPHEMERIS_TYPE: 0,
    CLASSIFICATION_TYPE: 'U',
    NORAD_CAT_ID: el.NORAD_CAT_ID,
    ELEMENT_SET_NO: 999,
    REV_AT_EPOCH: 0,
    BSTAR: el.BSTAR,
    MEAN_MOTION_DOT: el.MEAN_MOTION_DOT,
    MEAN_MOTION_DDOT: el.MEAN_MOTION_DDOT,
  });
}

/** Position and velocity in TEME [km, km/s]. */
export interface TemeState {
  readonly r: Vec3;
  readonly v: Vec3;
}

/** Why SGP4 could not give a position (satellite.js SatRecError, SPEC.md 6.1 step 6). */
export type Sgp4Failure =
  | 'eccentricity-out-of-range'
  | 'mean-motion-below-zero'
  | 'perturbed-eccentricity-out-of-range'
  | 'semi-latus-rectum-below-zero'
  | 'decayed'
  | 'unknown';

const FAILURES: Record<number, Sgp4Failure> = {
  [SatRecError.MeanEccentricityOutOfRange]: 'eccentricity-out-of-range',
  [SatRecError.MeanMotionBelowZero]: 'mean-motion-below-zero',
  [SatRecError.PerturbedEccentricityOutOfRange]: 'perturbed-eccentricity-out-of-range',
  [SatRecError.SemiLatusRectumBelowZero]: 'semi-latus-rectum-below-zero',
  [SatRecError.Decayed]: 'decayed',
};

export type Sgp4Result =
  ({ readonly ok: true } & TemeState) | { readonly ok: false; readonly failure: Sgp4Failure };

/**
 * Propagates to `tsinceMin` minutes after the element epoch (SGP4's native time argument;
 * negative is before the epoch). Used directly by the official verification tests.
 */
export function propagateMinutes(satrec: SatRec, tsinceMin: number): Sgp4Result {
  const pv = sgp4(satrec, tsinceMin);
  if (!pv || satrec.error !== SatRecError.None) {
    return { ok: false, failure: FAILURES[satrec.error] ?? 'unknown' };
  }
  const { position: r, velocity: v } = pv;
  return { ok: true, r: vec3(r.x, r.y, r.z), v: vec3(v.x, v.y, v.z) };
}

/** Minutes from the element epoch to time t. */
export const minutesSinceEpoch = (satrec: SatRec, t: UnixMs): number =>
  (julianDate(t) - satrec.jdsatepoch) * 1440;

/** Position and velocity in TEME at time t, or why there is none. */
export function propagateAt(satrec: SatRec, t: UnixMs): Sgp4Result {
  return propagateMinutes(satrec, minutesSinceEpoch(satrec, t));
}
