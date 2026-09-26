import { useEffect, useState } from 'preact/hooks';
import type { GameController } from '../../app/controller.ts';
import { getAdapter, savedName } from '../../leaderboard/outbox.ts';
import { eraOf } from '../../leaderboard/rank.ts';
import type { BoardRow, Boards, Era } from '../../leaderboard/types.ts';
import { formatClock } from '../../sim/time.ts';
import { APP_VERSION } from '../../version.ts';
import { money } from '../describe.ts';
import { isRanked, recordsLabel, sendRun, submission } from './submission.ts';

const CITY_NAME: Record<string, string> = { aleforge: 'Aleforge', shanty: 'Shanty Town', providence: 'Providence', roto: 'Roto Kaiishi' };
const CATEGORY_TAG: Record<string, string> = { assisted: 'Assisted', ngplus: 'NG+' };

/** End screen: runs are sent automatically; this says how that went (and asks for a name if there isn't one). */
export function RunRecordStatus({ ctrl }: { ctrl: GameController }) {
  const [name, setName] = useState(ctrl.world.meta.playerName || savedName());
  const s = submission.value;
  if (!isRanked(ctrl)) return <p class="small muted">{ctrl.tutorial ? 'Tutorial runs' : 'Debug runs'} aren’t recorded.</p>;
  const won = ctrl.world.run.status === 'won';
  if (s.state === 'needName' || s.state === 'error') {
    return (
      <div class="lb-submit">
        <p class="small">{s.error ?? 'Put your innkeeper name on this run for the Isles’ ledger:'}</p>
        <input type="text" maxLength={16} placeholder="Your name" value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} data-testid="lb-name" />
        <button class="btn btn-primary" onClick={() => void sendRun(ctrl, name)} disabled={!name.trim()} data-testid="lb-submit">Record this run</button>
      </div>
    );
  }
  const where = won ? `the ${recordsLabel()}` : 'the Isles’ ledger';
  const text: Record<string, string> = {
    idle: '',
    sending: 'Recording your run…',
    sent: `Run recorded in ${where}.`,
    queued: 'Couldn’t reach the ledger; your run is queued and will be sent automatically.',
    local: 'No shared board is set up yet, so this run is saved on this device only.',
  };
  return <p class={`run-status state-${s.state}`} data-testid="run-status">{text[s.state]}</p>;
}

function Table({ title, rows, kind }: { title: string; rows: BoardRow[]; kind: 'monopoly' | 'sponsor' }) {
  return (
    <div class="lb-board" data-testid={`board-${kind}`}>
      <h3>{title}</h3>
      <table class="grid-table lb-table">
        <thead><tr><th>#</th><th>Innkeeper</th><th>Tavern</th><th>{kind === 'monopoly' ? 'Time' : 'Company Value'}</th><th>Home</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={5} class="muted">No runs yet. Be the first.</td></tr>}
          {rows.map((r) => (
            <tr key={`${r.rank}-${r.name}-${r.date}`}>
              <td>{r.rank}</td>
              <td>{r.name}{CATEGORY_TAG[r.category] && <span class="tag">{CATEGORY_TAG[r.category]}</span>}</td>
              <td>{r.tavern}</td>
              <td>{kind === 'monopoly' ? formatClock(r.value) : money(r.value)}</td>
              <td class="muted">{CITY_NAME[r.homeCity] ?? r.homeCity}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LeaderboardView({ onClose }: { onClose: () => void }) {
  const current = eraOf(APP_VERSION);
  const [era, setEra] = useState<Era>(current);
  const [data, setData] = useState<Boards | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setData(null);
    setError('');
    getAdapter().boards(era).then((d) => live && setData(d)).catch((e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [era]);
  return (
    <div class="letter-backdrop" role="dialog" aria-label="Leaderboards" data-testid="leaderboard">
      <div class="lb-card">
        <div class="drawer-head">
          <h2>Leaderboards</h2>
          <button class="btn btn-small" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div class="lb-tabs">
          <button class={`btn ${era === 'official' ? 'on' : ''}`} onClick={() => setEra('official')} data-testid="era-official">Official records</button>
          <button class={`btn ${era === 'pre' ? 'on' : ''}`} onClick={() => setEra('pre')} data-testid="era-pre">Pre-release records (testing)</button>
        </div>
        <p class="small muted">
          {era === 'pre'
            ? 'Runs from the v1 testing builds. They stay here as a keepsake once v2.0 starts the official records.'
            : current === 'official' ? 'The official records of the Isles.' : 'Official records begin with v2.0.'}
          {!getAdapter().shared && ' Showing runs from this device until the shared board is set up.'}
        </p>
        {error && <p class="warn">Couldn't load the board: {error}</p>}
        {!data && !error && <p class="muted">Loading…</p>}
        {data && (
          <div class="lb-boards">
            <Table title="Fastest Monopoly" rows={data.monopoly} kind="monopoly" />
            <Table title="Sponsored the Trials" rows={data.sponsor} kind="sponsor" />
          </div>
        )}
      </div>
    </div>
  );
}
