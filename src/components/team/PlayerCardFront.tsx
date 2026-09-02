/**
 * PlayerCardFront — the ice-hockey-styled card face: rink frame graphic
 * with the athlete's photo set into the oval cutout and their name on
 * the plate near the bottom.
 *
 * Oval geometry below was measured directly against /card-frame.jpg
 * (768×1376) — the near-black cutout spans roughly x:24.5–75.4%, y:27.6–72.6%.
 */

const FRAME_URL = '/card-frame.jpg';
const DEFAULT_PHOTO_URL = '/card-default-photo.jpg';
const OVAL = { left: 24.5, top: 27.6, width: 50.9, height: 45 };

interface Props {
  athleteName: string;
  photoURL?: string;
  jerseyNumber?: number | null;
}

export default function PlayerCardFront({ athleteName, photoURL, jerseyNumber }: Props) {
  return (
    <div className="relative w-full rounded-xl overflow-hidden" style={{ aspectRatio: '768 / 1376' }}>
      <img src={FRAME_URL} alt="" className="absolute inset-0 w-full h-full object-cover" draggable={false} />

      <div
        className="absolute rounded-full overflow-hidden bg-app-secondary"
        style={{ left: `${OVAL.left}%`, top: `${OVAL.top}%`, width: `${OVAL.width}%`, height: `${OVAL.height}%` }}
      >
        {photoURL ? (
          <img src={photoURL} alt={athleteName} className="w-full h-full object-cover" />
        ) : (
          <img src={DEFAULT_PHOTO_URL} alt="" className="w-full h-full object-cover opacity-30" draggable={false} />
        )}
      </div>

      {jerseyNumber !== undefined && jerseyNumber !== null && (
        <span className="absolute top-[26%] left-[9%] min-w-[22px] h-6 px-1 flex items-center justify-center rounded-full bg-app-blue text-white text-[11px] font-bold shadow">
          {jerseyNumber}
        </span>
      )}

      <div className="absolute left-0 right-0 top-[79%] text-center px-2">
        <span className="text-white text-xs sm:text-sm font-bold [text-shadow:0_1px_4px_rgba(0,0,0,0.9)] truncate block">
          {athleteName}
        </span>
      </div>
    </div>
  );
}
