/**
 * Public Tournament TV / scoreboard page — no login required.
 * Reads only tournamentPublic/{nominationId} (title + bracket, no roster —
 * see PublicTournament in types/index.ts and mirrorTournamentPublicData in
 * functions/src/index.ts for why). Renders one fixed-design-width board
 * (see .fit-inner in TournamentTV.css) and scales it as a whole to fill
 * the screen, so it never needs to scroll on any device — see the scale-
 * to-fit effect below for the full rationale.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { useLanguage } from '../../contexts/LanguageContext';
import { subscribeToPublicTournament } from '../../services/firebase/tournamentPublic';
import { computeGroupStandings, resolveTeamRef, allSurfaces } from '../../utils/tournamentBracket';
import { resolveCombatSlot, computeCombatPlacements } from '../../utils/combatBracket';
import type { PublicTournament, BracketMatch, CombatMatch, CombatDivision } from '../../types';
import './TournamentTV.css';

const STAGE_WIDTH = 1680;
const MAX_SCALE = 2.4;

export default function TournamentTV() {
  const { nominationId } = useParams<{ nominationId: string }>();
  const { t } = useLanguage();

  const [data, setData] = useState<PublicTournament | null>(null);
  const [loading, setLoading] = useState(true);
  const [clock, setClock] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');

  const stageRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  // Lock page scroll and paint the ink background behind this page while
  // mounted — reverted on unmount so navigating elsewhere in the SPA isn't
  // affected. Deliberately not baked into a global CSS selector.
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevBg = document.body.style.background;
    document.body.style.overflow = 'hidden';
    document.body.style.background = '#080B1E';
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.background = prevBg;
    };
  }, []);

  useEffect(() => {
    if (!nominationId) return;
    const unsub = subscribeToPublicTournament(nominationId, d => {
      setData(d);
      setLoading(false);
    });
    return unsub;
  }, [nominationId]);

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const pad = (n: number) => String(n).padStart(2, '0');
      setClock(`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // QR code for the mobile-friendly page (TournamentMobile.tsx) — a normal
  // scrolling page, not this board scaled down to phone size. Scan it to
  // follow along without squinting at a shrunk TV layout. Generated large
  // (see also .qr-box in TournamentTV.css) since this whole board is
  // typically viewed — and scanned from — several meters away on an actual
  // TV, not up close on a monitor.
  useEffect(() => {
    if (!nominationId) return;
    const mobileUrl = `${window.location.origin}/tournament/${nominationId}`;
    QRCode.toDataURL(mobileUrl, {
      width: 360,
      margin: 2,
      color: { dark: '#080B1E', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, [nominationId]);

  // Scale-to-fit — the whole board as ONE unit. On a narrow phone, width is
  // the binding constraint for every section equally, so one measurement
  // keeps every section's proportions matched to its content, with no
  // leftover gaps (splitting into independently-sized boxes per section
  // was tried and produced exactly that mismatch). Two ResizeObservers:
  // one on the stage (screen/layout size changes), one on the fit-inner
  // content itself (refit when live data changes what's on screen — a new
  // score, an extra upcoming match — without every state update needing to
  // remember to trigger a refit). maxScale keeps a light tournament (one
  // group, no live games) from blowing up oversized on a big display.
  useEffect(() => {
    const stage = stageRef.current;
    const inner = innerRef.current;
    if (!stage || !inner) return;

    let raf: number | null = null;

    const fit = () => {
      const naturalH = inner.scrollHeight;
      if (naturalH === 0) return;
      const availW = stage.clientWidth;
      const availH = stage.clientHeight;
      const scale = Math.min(availW / STAGE_WIDTH, availH / naturalH, MAX_SCALE);
      if (!isFinite(scale) || scale <= 0) return;
      inner.style.transform = `translateX(-50%) scale(${scale})`;
      inner.style.opacity = '1';
    };

    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(fit);
    };

    const ro1 = new ResizeObserver(schedule);
    ro1.observe(stage);
    const ro2 = new ResizeObserver(schedule);
    ro2.observe(inner);
    document.fonts?.ready.then(schedule).catch(() => {});
    schedule();

    return () => {
      ro1.disconnect();
      ro2.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [data]);

  const bracket = data?.bracket;

  const standingsByGroup = useMemo(() => {
    if (!bracket) return [];
    return bracket.groups.map(g => ({ group: g, rows: computeGroupStandings(bracket, g.id) }));
  }, [bracket]);

  const liveMatches = useMemo(
    () => (bracket ? bracket.matches.filter(m => m.live) : []),
    [bracket]
  );

  const upcomingMatches = useMemo(() => {
    if (!bracket) return [];
    return bracket.matches
      .filter(m => !m.live && (m.homeScore === undefined || m.awayScore === undefined))
      .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  }, [bracket]);

  const groupName = (groupId?: string) => bracket?.groups.find(g => g.id === groupId)?.name || '';

  if (loading) {
    return (
      <div className="tv-page">
        <div className="tv-status">{t('common.loading')}</div>
      </div>
    );
  }

  if (data?.combatBracket) {
    return <CombatBoard data={data} clock={clock} t={t} />;
  }

  if (!data || !bracket) {
    return (
      <div className="tv-page">
        <div className="tv-status">{t('tv.notFound')}</div>
      </div>
    );
  }

  return (
    <div className="tv-page">
      <div className="stage" ref={stageRef}>
        <div className="fit-inner" ref={innerRef}>
          <div className="screen">

            <header className="masthead">
              <div className="brand">
                <span className="mark">NEXUS TV</span>
                <h1>{data.title}</h1>
              </div>
              <div className="meta">
                {data.location && <div className="venue">{data.location}</div>}
                <div className="clock">{clock}</div>
              </div>
            </header>

            {bracket.groups.length > 0 && (
              <section>
                <div className="section-label">{t('tv.standings')}<span className="rule" /></div>
                <div className="standings">
                  {standingsByGroup.map(({ group, rows }) => (
                    <div className="group-card" key={group.id}>
                      <div className="head">
                        <span className="badge">{group.name}</span>
                        <h2>{t('nominations.group')} {group.name}</h2>
                      </div>
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th className="team-col">{t('nominations.team')}</th>
                            <th>Z</th><th>V</th><th>R</th><th>P</th>
                            <th className="score-col">Skóre</th><th>B</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row, i) => (
                            <tr key={row.team} className={i === 0 ? 'leader' : undefined}>
                              <td className="team-col">
                                {i > 0 && <span className="rank">{i + 1}.</span>}
                                {row.team}
                              </td>
                              <td className="num">{row.played}</td>
                              <td className="num">{row.won}</td>
                              <td className="num">{row.drawn}</td>
                              <td className="num">{row.lost}</td>
                              <td className="num score-col">{row.goalsFor}:{row.goalsAgainst}</td>
                              <td className="num pts">{row.points}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {liveMatches.length > 0 && (
              <section className="live-band">
                <div className="section-label">{t('tv.liveNow')}<span className="rule" /></div>
                <div className="live-grid">
                  {liveMatches.map(m => (
                    <LiveCard key={m.id} match={m} bracket={bracket} groupName={groupName} liveLabel={t('nominations.bracket.live')} />
                  ))}
                </div>
              </section>
            )}

            {upcomingMatches.length > 0 && (
              <section>
                <div className="section-label">{t('tv.upcoming')}<span className="rule" /></div>
                <div className="upcoming-strip">
                  {upcomingMatches.map(m => (
                    <div className="up-card" key={m.id}>
                      {m.startTime && <div className="time">{m.startTime}</div>}
                      <div className="matchup">
                        {resolveTeamRef(m.home, bracket)} – {resolveTeamRef(m.away, bracket)}
                      </div>
                      {(m.surface || m.groupId || m.label) && (
                        <div className="surface">{m.surface || groupName(m.groupId) || m.label}</div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            <div className="footer-row">
              <p className="footer-note">
                <b>{t('tv.footerBold')}</b> {t('tv.footerNote')}
              </p>
              {qrDataUrl && (
                <div className="qr-panel">
                  <div className="qr-box"><img src={qrDataUrl} alt="QR" /></div>
                  <div className="qr-copy">
                    <div className="label">{t('tv.scanToFollow')}</div>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

function LiveCard({
  match, bracket, groupName, liveLabel,
}: {
  match: BracketMatch;
  bracket: NonNullable<PublicTournament['bracket']>;
  groupName: (groupId?: string) => string;
  liveLabel: string;
}) {
  return (
    <div className="live-card">
      <span className="live-tag"><span className="dot" />{liveLabel}</span>
      <div className="live-meta">
        <span className="period">{match.startTime || ''}</span>
        <span>{match.groupId ? groupName(match.groupId) : (match.label || '')}</span>
      </div>
      <div className="live-score">
        <div className="team home"><div className="name">{resolveTeamRef(match.home, bracket)}</div></div>
        <div className="score">
          {match.homeScore ?? '–'}<span className="sep">:</span>{match.awayScore ?? '–'}
        </div>
        <div className="team away"><div className="name">{resolveTeamRef(match.away, bracket)}</div></div>
      </div>
      {match.surface && <div className="live-surface"><b>{match.surface}</b></div>}
    </div>
  );
}

// ── Combat board (karate/taekwondo/kickboxing/MMA) ──────────────────────────
// A grid of independent "mats" instead of one score/standings page — each
// mat shows whichever bout is live there plus the next two queued. Grouped
// by the surface staff actually assigned matches to (allSurfaces, shared
// with the team-score rink system); falls back to one panel per division
// when no mats have been set up yet, so the board still shows something
// useful immediately after creating the tournament.

type CombatEntry = { match: CombatMatch; division: CombatDivision };

interface CombatPanelData {
  key: string;
  colorIndex: number;
  chipLabel: string;
  surfaceLabel: string;
  live: CombatEntry | null;
  upcoming: CombatEntry[];
}

function sortEntries(entries: CombatEntry[]): CombatEntry[] {
  return entries.slice().sort((a, b) => a.match.round - b.match.round || a.match.matchNumber - b.match.matchNumber);
}

function buildCombatPanels(bracket: NonNullable<PublicTournament['combatBracket']>): CombatPanelData[] {
  const allEntries: CombatEntry[] = bracket.divisions.flatMap(d => d.matches.map(m => ({ match: m, division: d })));
  const surfaces = allSurfaces(bracket.rinks || []);

  // Staff commonly assign a mat only once per division (when starting its
  // first fight), expecting the rest of that division's bracket to stay on
  // the same tatami — without this, a later match with no explicit
  // `surface` of its own (e.g. the final, waiting on two still-open
  // semifinals) would never appear in any panel's upcoming list.
  const divisionSurface = new Map<string, string>();
  for (const d of bracket.divisions) {
    const withSurface = d.matches.find(m => m.surface);
    if (withSurface?.surface) divisionSurface.set(d.id, withSurface.surface);
  }
  const effectiveSurface = (e: CombatEntry) => e.match.surface || divisionSurface.get(e.division.id);

  if (surfaces.length > 0) {
    return surfaces.map((surface, i) => {
      const onSurface = allEntries.filter(e => effectiveSurface(e) === surface);
      return {
        key: surface,
        colorIndex: i % 4,
        chipLabel: String(i + 1),
        surfaceLabel: surface,
        live: onSurface.find(e => e.match.live) || null,
        upcoming: sortEntries(onSurface.filter(e => !e.match.winner && !e.match.live)).slice(0, 2),
      };
    });
  }

  // No mats configured yet — one panel per division instead.
  return bracket.divisions.map((d, i) => {
    const entries: CombatEntry[] = d.matches.map(m => ({ match: m, division: d }));
    return {
      key: d.id,
      colorIndex: i % 4,
      chipLabel: String(i + 1),
      surfaceLabel: d.name,
      live: entries.find(e => e.match.live) || null,
      upcoming: sortEntries(entries.filter(e => !e.match.winner && !e.match.live)).slice(0, 2),
    };
  });
}

function CombatBoard({ data, clock, t }: { data: PublicTournament; clock: string; t: ReturnType<typeof useLanguage>['t'] }) {
  const bracket = data.combatBracket!;
  const panels = buildCombatPanels(bracket);
  const gridCount = panels.length > 0 && panels.length <= 4 ? String(panels.length) : 'many';

  const byeLabel = t('nominations.bracket.wizard.standaloneBye');
  const results = bracket.divisions
    .map(division => ({ division, placements: computeCombatPlacements(division, byeLabel) }))
    .filter(r => r.placements.length > 0);

  return (
    <div className="tv-page">
      <div className="combat-board">
        <header className="combat-masthead">
          <h1>{data.title}</h1>
          <div className="clock">{clock}</div>
        </header>
        <div className="combat-grid" data-count={gridCount}>
          {panels.map(panel => <CombatMat key={panel.key} panel={panel} t={t} />)}
        </div>
        {results.length > 0 && (
          <div className="combat-results">
            <div className="combat-results-label">{t('tv.combatResults')}</div>
            <div className="combat-results-list">
              {results.map(({ division, placements }) => (
                <div className="combat-result-card" key={division.id}>
                  <div className="division">{division.name}</div>
                  {placements.map((p, i) => (
                    <div className={`podium-row place-${p.place}`} key={i}>
                      <span className="medal">{p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : '🥉'}</span>
                      <span className="name">{p.name}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CombatMat({ panel, t }: { panel: CombatPanelData; t: ReturnType<typeof useLanguage>['t'] }) {
  const { live, upcoming, colorIndex, chipLabel, surfaceLabel } = panel;

  return (
    <div className="combat-mat" data-color={colorIndex}>
      <div className="head">
        <div className="id">
          <div className="chip">{chipLabel}</div>
          <div className="surface-name">{surfaceLabel}</div>
        </div>
        {live ? (
          <span className="live-badge"><span className="dot" />{t('nominations.bracket.live')}</span>
        ) : (
          <span className="idle-tag">{t('tv.combatIdle')}</span>
        )}
      </div>

      {live ? (
        <div className="combat-current">
          <div className="division">{live.division.name}</div>
          <div className="round">{live.match.label}</div>
          <div className="combat-fighters">
            <div className={`fighter home${live.match.winner === 'home' ? ' winning' : ''}`}>
              {resolveCombatSlot(live.match.home, live.division.matches)}
            </div>
            <div className="combat-score">
              <span>{live.match.homeScore ?? 0}</span>
              <span className="sep">:</span>
              <span>{live.match.awayScore ?? 0}</span>
            </div>
            <div className={`fighter away${live.match.winner === 'away' ? ' winning' : ''}`}>
              {resolveCombatSlot(live.match.away, live.division.matches)}
            </div>
          </div>
        </div>
      ) : (
        <div className="combat-idle">{t('tv.combatWaiting')}</div>
      )}

      {upcoming.length > 0 && (
        <div className="combat-upnext">
          <div className="label">{t('tv.upcoming')}</div>
          {upcoming.map(({ match, division }) => (
            <div className="row" key={match.id}>
              <span className="who">
                {match.startTime && <span className="time">{match.startTime}</span>}
                {resolveCombatSlot(match.home, division.matches)} – {resolveCombatSlot(match.away, division.matches)}
              </span>
              <span className="meta">{division.name} · {match.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
