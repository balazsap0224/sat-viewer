// Time bar (SPEC.md 7.2): play / pause, direction, speed 1× to 1,000×, a slider over ±7 days
// around the real time, and "Now" (back to live). On phones (`compact`, module 8) the four speed
// buttons become one that steps through them, and the slider shares the row with the buttons.

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

export function TimeBar({ compact = false }: { readonly compact?: boolean }) {
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
  const chooseSpeed = (s: number) => {
    setSpeed(s);
    if (!paused) play(s, forward);
  };
  const toggleDirection = () => {
    setForward(!forward);
    if (!paused) play(speed, !forward);
  };
  const playPause = () => (paused ? play(speed, forward) : simClock.setRate(0));
  const backToNow = () => {
    setSpeed(1);
    setForward(true);
    simClock.live();
  };
  const slider = (
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
  );
  const header = (
    <div className="timebar-row">
      <span className="num timebar-time">{formatUtc(t)}</span>
      <span className={`badge ${live ? 'badge-good' : 'badge-accent'}`}>
        {formatOffset(offset, live)}
      </span>
    </div>
  );

  if (compact) {
    const next = SPEEDS[(SPEEDS.indexOf(speed as (typeof SPEEDS)[number]) + 1) % SPEEDS.length]!;
    return (
      <div className="pane timebar timebar-compact" role="group" aria-label="Time">
        {header}
        <div className="timebar-row">
          <button
            className="btn"
            onClick={toggleDirection}
            aria-label={forward ? 'Run time backwards' : 'Run time forwards'}
          >
            {forward ? '→' : '←'}
          </button>
          <button
            className={`btn ${paused ? 'btn-primary' : ''}`}
            onClick={playPause}
            aria-label={paused ? 'Play' : 'Pause'}
          >
            {paused ? '▶' : '❚❚'}
          </button>
          <button
            className="btn timebar-speed"
            onClick={() => chooseSpeed(next)}
            aria-label={`Speed ${speed}×; tap for ${next.toLocaleString('en-US')}×`}
          >
            {speed.toLocaleString('en-US')}×
          </button>
          {slider}
          <button className="btn" disabled={live} onClick={backToNow}>
            Now
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="pane timebar" role="group" aria-label="Time">
      {header}
      <div className="timebar-row">
        <button
          className="btn btn-small"
          onClick={toggleDirection}
          aria-label={forward ? 'Run time backwards' : 'Run time forwards'}
          title={forward ? 'Time runs forwards' : 'Time runs backwards'}
        >
          {forward ? '→' : '←'}
        </button>
        <button
          className={`btn btn-small ${paused ? 'btn-primary' : ''}`}
          style={{ width: 66 }}
          onClick={playPause}
        >
          {paused ? '▶ Play' : '❚❚ Pause'}
        </button>
        {SPEEDS.map((s) => (
          <button
            key={s}
            className={`btn btn-small ${speed === s ? 'btn-active' : ''}`}
            aria-pressed={speed === s}
            onClick={() => chooseSpeed(s)}
          >
            {s.toLocaleString('en-US')}×
          </button>
        ))}
        <button className="btn btn-small" disabled={live} onClick={backToNow}>
          Now
        </button>
      </div>
      {slider}
      <div className="timebar-scale faint small" aria-hidden>
        <span>−{TIME_WINDOW_DAYS} d</span>
        <span>now</span>
        <span>+{TIME_WINDOW_DAYS} d</span>
      </div>
    </div>
  );
}
