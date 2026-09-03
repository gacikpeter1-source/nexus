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
import { computeGroupStandings, resolveTeamRef } from '../../utils/tournamentBracket';
import RinkBoard from './RinkBoard';
import type { PublicTournament, BracketMatch } from '../../types';
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

  // QR code for the current page's own URL — scan it to open the same
  // live scoreboard on a phone or tablet.
  useEffect(() => {
    QRCode.toDataURL(window.location.href, {
      width: 128,
      margin: 1,
      color: { dark: '#080B1E', light: '#ffffff' },
    })
      .then(setQrDataUrl)
      .catch(() => {});
  }, []);

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
                {bracket.rinks && bracket.rinks.length > 0 ? (
                  <div
                    className="rink-grid"
                    style={{ gridTemplateColumns: `repeat(${Math.min(bracket.rinks.length, 3)}, 1fr)` }}
                  >
                    {bracket.rinks.map(rink => (
                      <RinkBoard
                        key={rink.id}
                        rink={rink}
                        matches={bracket.matches}
                        bracket={bracket}
                        groupName={groupName}
                        startedLabel={t('nominations.bracket.started')}
                        idleLabel={t('tv.idle')}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="live-grid">
                    {liveMatches.map(m => (
                      <LiveCard key={m.id} match={m} bracket={bracket} groupName={groupName} liveLabel={t('nominations.bracket.live')} />
                    ))}
                  </div>
                )}
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
