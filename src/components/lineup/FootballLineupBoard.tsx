/**
 * Pitch-diagram view of a football lineup — the whole XI shown at once (no
 * lines/lanes to swipe through, unlike hockey; a formation is one static
 * layout). Same jersey treatment as every other sport's board: two
 * solid-color masks (body + trim) auto-colored from the club logo, the
 * club logo + name/number directly on the fabric.
 *
 * buildFootballSlots() returns portrait-oriented x/y (goalkeeper near the
 * bottom, forwards near the top) since that's how the old SVG pitch was
 * drawn. The real pitch photo here is landscape, so positions are
 * transposed (left = slot.y, top = slot.x) rather than recomputed — the
 * same "row spread" / "how far from goal" values just read as width/depth
 * on a sideways pitch instead of height/depth on a portrait one.
 */

import { useJerseyColors, contrastColor } from '../../hooks/useJerseyColors';
import JerseyIcon, { type RosterPlayer } from './JerseyIcon';
import { buildFootballSlots, type FootballSlot } from '../../utils/lineupPositions';

const PITCH_IMAGE = '/playgrounds/football-field-ai.png';
const PITCH_ASPECT = '1536 / 1024';

export default function FootballLineupBoard({
  formation, assign, roster, canEdit, onOpenSlot, clubLogoUrl,
}: {
  formation: string;
  assign: Record<string, string | null>;
  roster: RosterPlayer[];
  canEdit: boolean;
  onOpenSlot: (slotId: string, labelKey: string) => void;
  clubLogoUrl?: string;
}) {
  const colors = useJerseyColors(clubLogoUrl);
  const textColor = contrastColor(colors.primary);
  const slots: FootballSlot[] = buildFootballSlots(formation);

  return (
    <div className="relative w-full rounded-xl overflow-hidden bg-app-primary" style={{ aspectRatio: PITCH_ASPECT }}>
      <img src={PITCH_IMAGE} alt="" className="absolute inset-0 w-full h-full object-cover pointer-events-none" draggable={false} />

      {slots.map(slot => (
        <JerseyIcon
          key={slot.id}
          left={slot.y} top={slot.x} w={slot.group === 'gk' ? 13 : 11}
          playerId={assign[slot.id] || null}
          roster={roster}
          canEdit={canEdit}
          onClick={() => onOpenSlot(slot.id, slot.labelKey)}
          colors={colors}
          textColor={textColor}
          clubLogoUrl={clubLogoUrl}
        />
      ))}
    </div>
  );
}
