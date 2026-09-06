/**
 * Sport-specific venue terminology for the tournament bracket UI (rink/pitch/
 * court/pool/mat/lane/table management: "Add a Rink" etc.).
 *
 * This is deliberately its own small registry instead of interpolating a
 * `{{venue}}` noun into the normal en.json/sk.json strings: Slovak grammar
 * changes the surrounding words based on the noun's gender ("Celé klzisko"
 * vs. "Celý bazén" vs. "Celá dráha") and case ("Pridať bazén" vs. "Pridať
 * dráhu"), so a single template can't correctly produce every sport's
 * phrasing. Each phrase below is written out in full per sport+language
 * instead, which stays grammatically correct without a grammar engine.
 *
 * Sports that aren't given here (or when no sport is set at all — club/
 * nomination tournaments predate this field) fall back to 'hockey', the
 * original wording, so existing tournaments are unaffected.
 */

import type { SportId } from './sports';

export interface VenueLabels {
  singular: string;
  plural: string;
  addLabel: string;
  namePlaceholder: string;
  fullLabel: string;
  removeConfirm: string;
  rinksDescription: string;
  defaultName: (n: number) => string;
}

type VenueLabelsByLanguage = Record<'en' | 'sk', VenueLabels>;

const rinkLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Rink',
    plural: 'Rinks',
    addLabel: 'Add Rink',
    namePlaceholder: 'Rink name (e.g. Rink 1)',
    fullLabel: 'Full Rink',
    removeConfirm: 'Remove this rink?',
    rinksDescription: "Add one entry per rink, and note whether it's split into smaller surfaces (e.g. cross-ice halves). Matches on different surfaces at the same time can be played simultaneously.",
    defaultName: n => `Rink ${n}`,
  },
  sk: {
    singular: 'Klzisko',
    plural: 'Klziská',
    addLabel: 'Pridať klzisko',
    namePlaceholder: 'Názov klziska (napr. Klzisko 1)',
    fullLabel: 'Celé klzisko',
    removeConfirm: 'Odstrániť toto klzisko?',
    rinksDescription: 'Pridajte jeden riadok za každé klzisko a označte, či je rozdelené na menšie plochy (napr. polovice naprieč ihriskom). Zápasy na rôznych plochách v rovnakom čase sa môžu hrať súčasne.',
    defaultName: n => `Klzisko ${n}`,
  },
};

const pitchLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Pitch',
    plural: 'Pitches',
    addLabel: 'Add Pitch',
    namePlaceholder: 'Pitch name (e.g. Pitch 1)',
    fullLabel: 'Full Pitch',
    removeConfirm: 'Remove this pitch?',
    rinksDescription: "Add one entry per pitch, and note whether it's split into smaller surfaces (e.g. halves for small-sided games). Matches on different surfaces at the same time can be played simultaneously.",
    defaultName: n => `Pitch ${n}`,
  },
  sk: {
    singular: 'Ihrisko',
    plural: 'Ihriská',
    addLabel: 'Pridať ihrisko',
    namePlaceholder: 'Názov ihriska (napr. Ihrisko 1)',
    fullLabel: 'Celé ihrisko',
    removeConfirm: 'Odstrániť toto ihrisko?',
    rinksDescription: 'Pridajte jeden riadok za každé ihrisko a označte, či je rozdelené na menšie plochy (napr. polovice pre malé hry). Zápasy na rôznych plochách v rovnakom čase sa môžu hrať súčasne.',
    defaultName: n => `Ihrisko ${n}`,
  },
};

const courtLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Court',
    plural: 'Courts',
    addLabel: 'Add Court',
    namePlaceholder: 'Court name (e.g. Court 1)',
    fullLabel: 'Full Court',
    removeConfirm: 'Remove this court?',
    rinksDescription: "Add one entry per court, and note whether it's split into smaller surfaces (e.g. half-court games). Matches on different surfaces at the same time can be played simultaneously.",
    defaultName: n => `Court ${n}`,
  },
  sk: {
    singular: 'Kurt',
    plural: 'Kurty',
    addLabel: 'Pridať kurt',
    namePlaceholder: 'Názov kurtu (napr. Kurt 1)',
    fullLabel: 'Celý kurt',
    removeConfirm: 'Odstrániť tento kurt?',
    rinksDescription: 'Pridajte jeden riadok za každý kurt a označte, či je rozdelený na menšie plochy (napr. poloviční kurty). Zápasy na rôznych plochách v rovnakom čase sa môžu hrať súčasne.',
    defaultName: n => `Kurt ${n}`,
  },
};

const poolLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Pool',
    plural: 'Pools',
    addLabel: 'Add Pool',
    namePlaceholder: 'Pool name (e.g. Pool 1)',
    fullLabel: 'Full Pool',
    removeConfirm: 'Remove this pool?',
    rinksDescription: 'Add one entry per pool, and note whether it has separate lanes for simultaneous matches. Matches in different pools at the same time can be played simultaneously.',
    defaultName: n => `Pool ${n}`,
  },
  sk: {
    singular: 'Bazén',
    plural: 'Bazény',
    addLabel: 'Pridať bazén',
    namePlaceholder: 'Názov bazéna (napr. Bazén 1)',
    fullLabel: 'Celý bazén',
    removeConfirm: 'Odstrániť tento bazén?',
    rinksDescription: 'Pridajte jeden riadok za každý bazén a označte, či sú v ňom oddelené dráhy pre súbežné zápasy. Zápasy v rôznych bazénoch v rovnakom čase sa môžu hrať súčasne.',
    defaultName: n => `Bazén ${n}`,
  },
};

const tableLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Table',
    plural: 'Tables',
    addLabel: 'Add Table',
    namePlaceholder: 'Table name (e.g. Table 1)',
    fullLabel: 'Full Table',
    removeConfirm: 'Remove this table?',
    rinksDescription: 'Add one entry per table used for matches. Matches on different tables at the same time can be played simultaneously.',
    defaultName: n => `Table ${n}`,
  },
  sk: {
    singular: 'Stôl',
    plural: 'Stoly',
    addLabel: 'Pridať stôl',
    namePlaceholder: 'Názov stola (napr. Stôl 1)',
    fullLabel: 'Celý stôl',
    removeConfirm: 'Odstrániť tento stôl?',
    rinksDescription: 'Pridajte jeden riadok za každý stôl. Zápasy na rôznych stoloch v rovnakom čase sa môžu hrať súčasne.',
    defaultName: n => `Stôl ${n}`,
  },
};

const laneLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Lane',
    plural: 'Lanes',
    addLabel: 'Add Lane',
    namePlaceholder: 'Lane name (e.g. Lane 1)',
    fullLabel: 'Full Lane',
    removeConfirm: 'Remove this lane?',
    rinksDescription: 'Add one entry per lane. Heats on different lanes at the same time can run simultaneously.',
    defaultName: n => `Lane ${n}`,
  },
  sk: {
    singular: 'Dráha',
    plural: 'Dráhy',
    addLabel: 'Pridať dráhu',
    namePlaceholder: 'Názov dráhy (napr. Dráha 1)',
    fullLabel: 'Celá dráha',
    removeConfirm: 'Odstrániť túto dráhu?',
    rinksDescription: 'Pridajte jeden riadok za každú dráhu. Behy alebo rozplavby na rôznych dráhach v rovnakom čase môžu prebiehať súčasne.',
    defaultName: n => `Dráha ${n}`,
  },
};

const matLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Mat',
    plural: 'Mats',
    addLabel: 'Add Mat',
    namePlaceholder: 'Mat name (e.g. Mat 1)',
    fullLabel: 'Full Mat',
    removeConfirm: 'Remove this mat?',
    rinksDescription: 'Add one entry per mat. Bouts on different mats at the same time can run simultaneously.',
    defaultName: n => `Mat ${n}`,
  },
  sk: {
    singular: 'Tatami',
    plural: 'Tatami',
    addLabel: 'Pridať tatami',
    namePlaceholder: 'Názov tatami (napr. Tatami 1)',
    fullLabel: 'Celé tatami',
    removeConfirm: 'Odstrániť toto tatami?',
    rinksDescription: 'Pridajte jeden riadok za každé tatami. Zápasy na rôznych tatami v rovnakom čase sa môžu konať súčasne.',
    defaultName: n => `Tatami ${n}`,
  },
};

const ringLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Ring',
    plural: 'Rings',
    addLabel: 'Add Ring',
    namePlaceholder: 'Ring name (e.g. Ring 1)',
    fullLabel: 'Full Ring',
    removeConfirm: 'Remove this ring?',
    rinksDescription: 'Add one entry per ring. Bouts on different rings at the same time can run simultaneously.',
    defaultName: n => `Ring ${n}`,
  },
  sk: {
    singular: 'Ring',
    plural: 'Ringy',
    addLabel: 'Pridať ring',
    namePlaceholder: 'Názov ringu (napr. Ring 1)',
    fullLabel: 'Celý ring',
    removeConfirm: 'Odstrániť tento ring?',
    rinksDescription: 'Pridajte jeden riadok za každý ring. Zápasy na rôznych ringoch v rovnakom čase sa môžu konať súčasne.',
    defaultName: n => `Ring ${n}`,
  },
};

const cageLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Cage',
    plural: 'Cages',
    addLabel: 'Add Cage',
    namePlaceholder: 'Cage name (e.g. Cage 1)',
    fullLabel: 'Full Cage',
    removeConfirm: 'Remove this cage?',
    rinksDescription: 'Add one entry per cage. Bouts in different cages at the same time can run simultaneously.',
    defaultName: n => `Cage ${n}`,
  },
  sk: {
    singular: 'Klietka',
    plural: 'Klietky',
    addLabel: 'Pridať klietku',
    namePlaceholder: 'Názov klietky (napr. Klietka 1)',
    fullLabel: 'Celá klietka',
    removeConfirm: 'Odstrániť túto klietku?',
    rinksDescription: 'Pridajte jeden riadok za každú klietku. Zápasy v rôznych klietkach v rovnakom čase sa môžu konať súčasne.',
    defaultName: n => `Klietka ${n}`,
  },
};

const genericVenueLabels: VenueLabelsByLanguage = {
  en: {
    singular: 'Venue',
    plural: 'Venues',
    addLabel: 'Add Venue',
    namePlaceholder: 'Venue name (e.g. Venue 1)',
    fullLabel: 'Full Venue',
    removeConfirm: 'Remove this venue?',
    rinksDescription: "Add one entry per venue, and note whether it's split into smaller surfaces. Matches on different surfaces at the same time can be played simultaneously.",
    defaultName: n => `Venue ${n}`,
  },
  sk: {
    singular: 'Miesto konania',
    plural: 'Miesta konania',
    addLabel: 'Pridať miesto konania',
    namePlaceholder: 'Názov miesta konania (napr. Miesto 1)',
    fullLabel: 'Celé miesto konania',
    removeConfirm: 'Odstrániť toto miesto konania?',
    rinksDescription: 'Pridajte jeden riadok za každé miesto konania a označte, či je rozdelené na menšie plochy. Zápasy na rôznych plochách v rovnakom čase sa môžu hrať súčasne.',
    defaultName: n => `Miesto ${n}`,
  },
};

const VENUE_LABELS_BY_SPORT: Record<SportId, VenueLabelsByLanguage> = {
  hockey: rinkLabels,
  football: pitchLabels,
  basketball: courtLabels,
  waterPolo: poolLabels,
  volleyball: courtLabels,
  tennis: courtLabels,
  tableTennis: tableLabels,
  swimming: laneLabels,
  running: laneLabels,
  karate: matLabels,
  taekwondo: matLabels,
  kickboxing: ringLabels,
  mma: cageLabels,
  other: genericVenueLabels,
};

export function getVenueLabels(sportId: string | undefined | null, language: string): VenueLabels {
  const sport = (sportId && sportId in VENUE_LABELS_BY_SPORT ? sportId : 'hockey') as SportId;
  const lang = language === 'sk' ? 'sk' : 'en';
  return VENUE_LABELS_BY_SPORT[sport][lang];
}
