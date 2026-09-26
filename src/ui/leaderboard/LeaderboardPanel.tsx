import { useEffect, useState } from 'preact/hooks';
import type { GameController } from '../../app/controller.ts';
import { lcValidateRecord } from '../../leaderboard/shared/validate.js';
import { getAdapter, savedName, saveName, submitRun } from '../../leaderboard/outbox.ts';
import { buildRecord } from '../../leaderboard/record.ts';
import type { Board, BoardCategory, BoardRow } from '../../leaderboard/types.ts';
import { formatClock } from '../../sim/time.ts';
import { money } from '../describe.ts';

export function LeaderboardSubmit({ ctrl }: { ctrl: GameController }) {
  const [name, setName] = useState(savedName());
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'queued' | 'error'>('idle');
  const [err, setErr] = useState('');
  const submit = async () => {
    const rec = buildRecord(ctrl, name);
    const bad = lcValidateRecord(rec);
    if (bad) {
      setErr(bad === 'bad name' ? 'Names: 1–16 letters, numbers, spaces, . _ \' -' : bad);
      setState('error');
      return;
    }
    saveName(name);
    setState('sending');
    setState(await submitRun(rec));
  };
  return (
    <div class="lb-submit">
      <input type="text" maxLength={16} placeholder="Your name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} disabled={state === 'sent' || state === 'sending'} data-testid="lb-name" />
      <button class="btn btn-primary" onClick={submit} disabled={!name.trim() || state === 'sent' || state === 'sending'} data-testid="lb-submit">
        {state === 'sent' ? 'On the board!' : state === 'queued' ? 'Queued, will retry' : state === 'sending' ? 'Sending…' : 'Submit to the leaderboard'}
      </button>
      {state === 'error' && <span class="warn small">{err}</span>}
      {!getAdapter().shared && <p class="small muted">No shared board is set up yet, so this run is saved on this device only.</p>}
    </div>
  );
}

const CITY_NAME: Record<string, string> = { aleforge: 'Aleforge', shanty: 'Shanty Town', providence: 'Providence', roto: 'Roto Kaiishi' };

const CATS: Array<[BoardCategory, string]> = [
  ['overall', 'Overall'], ['aleforge', 'Aleforge'], ['shanty', 'Shanty Town'], ['providence', 'Providence'], ['roto', 'Roto Kaiishi'], ['assisted', 'Assisted'], ['ngplus', 'NG+'],
];

export function LeaderboardView({ onClose }: { onClose: () => void }) {
  const [board, setBoard] = useState<Board>('monopoly');
  const [cat, setCat] = useState<BoardCategory>('overall');
  const [rows, setRows] = useState<BoardRow[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setRows(null);
    setError('');
    getAdapter().board(board, cat, 25).then((r) => live && setRows(r)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [board, cat]);
  return (
    <div class="letter-backdrop" role="dialog" aria-label="Leaderboards" data-testid="leaderboard">
      <div class="lb-card">
        <div class="drawer-head">
          <h2>Leaderboards</h2>
          <button class="btn btn-small" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div class="lb-tabs">
          <button class={`btn ${board === 'monopoly' ? 'on' : ''}`} onClick={() => setBoard('monopoly')}>Fastest Monopoly</button>
          <button class={`btn ${board === 'cv' ? 'on' : ''}`} onClick={() => setBoard('cv')}>Highest Company Value</button>
        </div>
        <select value={cat} onChange={(e) => setCat((e.target as HTMLSelectElement).value as BoardCategory)}>
          {CATS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {!getAdapter().shared && <p class="small muted">Showing runs from this device. The shared board appears once it's set up (gas/README.md).</p>}
        {error && <p class="warn">Couldn't load the board: {error}</p>}
        {!rows && !error && <p class="muted">Loading…</p>}
        {rows && (
          <table class="grid-table lb-table">
            <thead><tr><th>#</th><th>Name</th><th>{board === 'monopoly' ? 'Time' : 'Company Value'}</th><th>Home</th><th>Date</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5} class="muted">No runs yet. Be the first.</td></tr>}
              {rows.map((r) => (
                <tr key={`${r.rank}-${r.name}`}>
                  <td>{r.rank}</td><td>{r.name}</td>
                  <td>{board === 'monopoly' ? formatClock(r.value) : money(r.value)}</td>
                  <td>{CITY_NAME[r.homeCity] ?? r.homeCity}</td><td class="muted">{r.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
