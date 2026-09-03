/**
 * Renders one physical rink as a photo with live score panels overlaid
 * directly on the patch of ice the match is actually being played on —
 * see TournamentTV.tsx for when this replaces the flat "Live Now" grid.
 * Zone geometry (dividers + panel/tag positions) is expressed as percentages
 * of the rink photo so it scales with the image at any size; the divider
 * SVG uses a fixed viewBox matching the photo's own aspect ratio.
 */

import { rinkSurfaces, resolveTeamRef } from '../../utils/tournamentBracket';
import type { TournamentRink, RinkLayout, BracketMatch, TournamentBracket } from '../../types';

const RINK_IMAGE = '/tv/ice-rink-board.jpg';
const DIVIDER_VIEWBOX = '0 0 1000 560';

interface Zone {
  surface: string;
  tag: string; // 'A' / 'B' / '1' / '2' / '3' — '' for a single-surface (full) rink
  panel: { x: number; y: number };
  tagPos?: { x: number; y: number };
}

function shortTag(surface: string): string {
  const i = surface.lastIndexOf('–');
  return i === -1 ? '' : surface.slice(i + 1).trim();
}

function zonesForRink(rink: TournamentRink): Zone[] {
  const surfaces = rinkSurfaces(rink);
  switch (rink.layout) {
    case 'halfCrossIce':
      return [
        { surface: surfaces[0], tag: shortTag(surfaces[0]), panel: { x: 25, y: 54 }, tagPos: { x: 25, y: 12 } },
        { surface: surfaces[1], tag: shortTag(surfaces[1]), panel: { x: 75, y: 54 }, tagPos: { x: 75, y: 12 } },
      ];
    case 'halfLengthwise':
      return [
        { surface: surfaces[0], tag: shortTag(surfaces[0]), panel: { x: 50, y: 27 }, tagPos: { x: 8, y: 10 } },
        { surface: surfaces[1], tag: shortTag(surfaces[1]), panel: { x: 50, y: 77 }, tagPos: { x: 8, y: 60 } },
      ];
    case 'thirdsCrossIce':
      return [
        { surface: surfaces[0], tag: shortTag(surfaces[0]), panel: { x: 16.67, y: 56 }, tagPos: { x: 16.67, y: 12 } },
        { surface: surfaces[1], tag: shortTag(surfaces[1]), panel: { x: 50, y: 56 }, tagPos: { x: 50, y: 12 } },
        { surface: surfaces[2], tag: shortTag(surfaces[2]), panel: { x: 83.33, y: 56 }, tagPos: { x: 83.33, y: 12 } },
      ];
    case 'full':
    default:
      return [{ surface: surfaces[0], tag: '', panel: { x: 50, y: 50 } }];
  }
}

function dividersForRink(rink: TournamentRink): { x1: number; y1: number; x2: number; y2: number }[] {
  switch (rink.layout) {
    case 'halfCrossIce':
      return [{ x1: 500, y1: 0, x2: 500, y2: 560 }];
    case 'thirdsCrossIce':
      return [{ x1: 333, y1: 0, x2: 333, y2: 560 }, { x1: 667, y1: 0, x2: 667, y2: 560 }];
    case 'halfLengthwise':
      return [{ x1: 0, y1: 280, x2: 1000, y2: 280 }];
    case 'full':
    default:
      return [];
  }
}

function panelSizeClass(layout: RinkLayout): string {
  if (layout === 'full') return 'size-lg';
  if (layout === 'thirdsCrossIce') return 'size-sm';
  return 'size-md';
}

export default function RinkBoard({
  rink, matches, bracket, groupName, startedLabel, idleLabel,
}: {
  rink: TournamentRink;
  matches: BracketMatch[];
  bracket: TournamentBracket;
  groupName: (groupId?: string) => string;
  startedLabel: string;
  idleLabel: string;
}) {
  const zones = zonesForRink(rink);
  const dividers = dividersForRink(rink);
  const sizeClass = panelSizeClass(rink.layout);

  return (
    <div className="rink-block">
      <div className="rink-head"><h2>{rink.name}</h2></div>
      <div className="rink-wrap">
        <img src={RINK_IMAGE} alt="" />
        {dividers.length > 0 && (
          <svg className="divider-svg" viewBox={DIVIDER_VIEWBOX} preserveAspectRatio="none">
            {dividers.map((d, i) => (
              <line
                key={i}
                x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2}
                stroke="#00D4FF" strokeWidth={6} strokeDasharray="3 16" strokeLinecap="round" opacity={0.9}
              />
            ))}
          </svg>
        )}
        {zones.map(zone => {
          // A surface can briefly carry more than one live-flagged match (staff
          // started the next game before marking the previous one Ended) — show
          // whichever one actually started most recently, per its own startTime.
          const candidates = matches.filter(m => m.live && m.surface === zone.surface);
          const match = candidates.length <= 1
            ? candidates[0]
            : candidates.reduce((latest, m) => ((m.startTime || '') > (latest.startTime || '') ? m : latest));
          return (
            <div key={zone.surface}>
              {zone.tag && zone.tagPos && (
                <div
                  className="zone-tag"
                  style={{ left: `${zone.tagPos.x}%`, top: `${zone.tagPos.y}%`, transform: 'translate(-50%,-50%)' }}
                >
                  {zone.tag}
                </div>
              )}
              {match ? (
                <div
                  className={`panel ${sizeClass}`}
                  style={{ left: `${zone.panel.x}%`, top: `${zone.panel.y}%`, transform: 'translate(-50%,-50%)' }}
                >
                  <span className="live-dot" />
                  <span className="team-name">{resolveTeamRef(match.home, bracket)}</span>
                  <span className="score-num">{match.homeScore ?? '–'}</span>
                  <span className="score-rule" />
                  <span className="score-num">{match.awayScore ?? '–'}</span>
                  <span className="team-name">{resolveTeamRef(match.away, bracket)}</span>
                  <span className="meta">
                    {match.startTime ? `${startedLabel} ${match.startTime}` : (match.groupId ? groupName(match.groupId) : (match.label || ''))}
                  </span>
                </div>
              ) : zone.tag ? (
                <div
                  className="idle-tag"
                  style={{ left: `${zone.panel.x}%`, top: `${zone.panel.y}%`, transform: 'translate(-50%,-50%)' }}
                >
                  {idleLabel}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
