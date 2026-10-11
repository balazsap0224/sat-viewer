// Time bar (SPEC.md 7.2): play / pause, direction, speed 1× to 1,000×, a slider over ±7 days
// around the real time, and "Now" (back to live).

import { MS_PER_DAY } from '@sat-viewer/core';
import { useEffect, useState } from 'react';
import { MAX_RATE, simClock, TIME_WINDOW_DAYS, useClockState } from '../state/simClock';
import { formatUtc } from './ClockReadout';

const SPEEDS = [1, 10, 100, MAX_RATE] as const;

/** "+2 d 03:12" / "−0 d 00:05" relative to the real time, or "live". */
export function formatOffset(offsetMs: number, live: boolean): string {
  if (live) return 'Live';
  const sign = offsetMs < 0 ? '−' : '+';
  const abs = Math.abs(offsetMs);
  const days = Math.floor(abs / MS_PER_DAY);
  const h = Math.floor((abs % MS_PER_DAY) / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  return `${sign}${days} d ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function TimeBar() {
  const { rate } = useClockState();
  const [speed, setSpeed] = useState(1); // remembered while paused
  const [forward, setForward] = useState(true);
  const [t, setT] = useState(() => simClock.now());
  useEffect(() => {
    const id = setInterval(() => setT(simClock.now()), 200);
    return () => clearInterval(id);
  }, []);

  const paused = rate === 0;
  const offset = t - Date.now();
  // "Live": real speed, within a second of the real time.
  const live = rate === 1 && Math.abs(offset) < 1000;
  const play = (s: number, fwd: boolean) => simClock.setRate(fwd ? s : -s);

  return (
    <div className="pane timebar" role="group" aria-label="Time">
      <div className="timebar-row">
        <span className="num timebar-time">{formatUtc(t)}</span>
        <span className={`badge ${live ? 'badge-good' : 'badge-accent'}`}>
          {formatOffset(offset, live)}
        </span>
      </div>
      <div className="timebar-row">
        <button
          className="btn btn-small"
          onClick={() => {
            setForward(!forward);
            if (!paused) play(speed, !forward);
          }}
          aria-label={forward ? 'Run time backwards' : 'Run time forwards'}
          title={forward ? 'Time runs forwards' : 'Time runs backwards'}
        >
          {forward ? '→' : '←'}
        </button>
        <button
          className={`btn btn-small ${paused ? 'btn-primary' : ''}`}
          style={{ width: 66 }}
          onClick={() => (paused ? play(speed, forward) : simClock.setRate(0))}
        >
          {paused ? '▶ Play' : '❚❚ Pause'}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`btn btn-small ${speed === s ? 'btn-active' : ''}`}
            aria-pressed={speed === s}
            onClick={() => {
              setSpeed(s);
              if (!paused) play(s, forward);
            }}
          >
            {s.toLocaleString('en-US')}×
          </button>
        ))}
        <button
          className="btn btn-small"
          disabled={live}
          onClick={() => {
            setSpeed(1);
            setForward(true);
            simClock.live();
          }}
        >
          Now
        </button>
      </div>
      <input
        type="range"
        className="timebar-slider"
        min={-TIME_WINDOW_DAYS * 24}
        max={TIME_WINDOW_DAYS * 24}
        step={0.05}
        value={offset / 3_600_000}
        onChange={(e) => simClock.setTime(Date.now() + Number(e.target.value) * 3_600_000)}
        aria-label={`Shown time, ${TIME_WINDOW_DAYS} days either side of now`}
      />
      <div className="timebar-scale faint small" aria-hidden>
        <span>−{TIME_WINDOW_DAYS} d</span>
        <span>now</span>
        <span>+{TIME_WINDOW_DAYS} d</span>
      </div>
    </div>
  );
}
