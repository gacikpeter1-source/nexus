/**
 * One player's jersey on a lineup board — shared across every sport's
 * board (hockey, football, ...). Two solid-color masks (body + trim) filled
 * from the club's auto-derived jersey colors, the club logo on the chest,
 * and name/number directly on the fabric with no background box. An empty
 * slot renders desaturated with a "+".
 */

const BODY_MASK_URL = '/jersey-body-mask.png';
const TRIM_MASK_URL = '/jersey-trim-mask.png';
export const JERSEY_ASPECT = '1230 / 1087';
const EMPTY_COLOR = '#5b6072';

export type RosterPlayer = { id: string; name: string; jerseyNumber?: number };
export type JerseyColors = { primary: string; secondary: string };

function maskStyle(url: string, color: string): React.CSSProperties {
  return {
    position: 'absolute', inset: 0, background: color,
    WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`,
    WebkitMaskSize: 'contain', maskSize: 'contain',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center', maskPosition: 'center',
  } as React.CSSProperties;
}

export default function JerseyIcon({
  left, top, w, playerId, roster, canEdit, onClick, colors, textColor, clubLogoUrl,
}: {
  left: number; top: number; w: number;
  playerId: string | null;
  roster: RosterPlayer[];
  canEdit: boolean;
  onClick: () => void;
  colors: JerseyColors;
  textColor: string;
  clubLogoUrl?: string;
}) {
  const player = playerId ? roster.find(r => r.id === playerId) : null;
  const empty = !player;
  const name = player ? (player.name || '').trim().split(' ').filter(Boolean).pop() || player.name || '?' : '';
  const num = empty ? '+' : `#${player!.jerseyNumber ?? '—'}`;

  return (
    <button
      type="button"
      disabled={!canEdit}
      onClick={onClick}
      className="absolute -translate-x-1/2 -translate-y-1/2 disabled:cursor-default p-0 border-0 bg-transparent"
      style={{
        left: `${left}%`, top: `${top}%`, width: `${w}%`, aspectRatio: JERSEY_ASPECT,
        containerType: 'inline-size',
      } as React.CSSProperties}
    >
      <div style={maskStyle(BODY_MASK_URL, empty ? EMPTY_COLOR : colors.primary)} />
      <div style={maskStyle(TRIM_MASK_URL, empty ? EMPTY_COLOR : colors.secondary)} />
      {!empty && clubLogoUrl && (
        <img
          src={clubLogoUrl}
          alt=""
          className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: '50%', top: '16%', width: '30%', boxShadow: '0 1px 4px rgba(0,0,0,0.5)' }}
        />
      )}
      {/* Font sizes scale off the jersey's OWN rendered width (container query
          units), not the viewport — this icon is reused at very different
          sizes across sports (5-6 big icons for hockey vs up to 11 small
          ones for football) and vw-relative sizing only ever suited one. */}
      <span
        className="absolute -translate-x-1/2 font-extrabold whitespace-nowrap overflow-hidden text-ellipsis"
        style={{ left: '50%', top: '38%', maxWidth: '92%', fontSize: 'clamp(6px, 13cqw, 16px)', lineHeight: 1.1, color: empty ? '#9096ad' : textColor }}
      >
        {name}
      </span>
      <span
        className="absolute -translate-x-1/2 font-extrabold whitespace-nowrap"
        style={{ left: '50%', top: '48%', fontSize: 'clamp(9px, 22cqw, 30px)', lineHeight: 1, color: empty ? '#9096ad' : textColor }}
      >
        {num}
      </span>
    </button>
  );
}
