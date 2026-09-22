/* Portraits for the style catalogue.
 *
 *  Drawn rather than photographed, for reasons that matter more than realism:
 *  a drawing can be *of* the named cut — stock photography of "wolf cut" is a
 *  lottery — it carries the app's own warm palette instead of eighteen
 *  different studio walls, and it needs no network at the moment somebody
 *  opens the screen.
 *
 *  Two rules keep them from looking like avatars. **Crop close**: the head
 *  fills the frame and the shoulders only enter at the very bottom, the way a
 *  salon shoots its own lookbook. **Draw the silhouette, not the detail**: one
 *  confident hair shape reads as a haircut at 150px wide; fine strokes and
 *  small flourishes turn to noise at that size and make the whole grid look
 *  unfinished.
 *
 *  Faceless on purpose. A salon's own branding almost always is: the hair is
 *  the subject, and a half-drawn face fights it.
 *
 *  Each is a data URL, so `Art` treats one exactly like a photograph — same
 *  `object-fit: cover`, same crop, same rounding.
 */

const SKINS = ['#e0b995', '#d3a271', '#bd8a5c', '#a06f46'];
const skinAt = (n: number) => SKINS[n % SKINS.length];

const HAIR = {
  jet: '#1f1610',
  dark: '#31221a',
  coffee: '#46301f',
  chestnut: '#6a4222',
  caramel: '#a8692a',
  honey: '#c98f3f',
  ash: '#8a857e',
  silver: '#bdb8b0',
};

/** Card grounds: a deep wash to a light one, so the head reads against it.
    Stepped the way `--art-bg-*` steps, and pulled from the same warm family. */
const GROUND = [
  ['#c9ab7d', '#f0e7d8'],
  ['#cfae74', '#f2ead4'],
  ['#bfb49f', '#ece7dd'],
  ['#cfa387', '#f3e6db'],
  ['#a9b490', '#e9ecdf'],
  ['#d3b276', '#f4ecd6'],
];

interface Look {
  /** Behind the head: the mass that falls past the face. */
  back?: (h: string) => string;
  /** Over the head: the cut itself. */
  front: (h: string) => string;
  hair: string;
  /** Colour work is a gradient down the *same* silhouette — roots to ends,
      the way it actually grows out. Painting highlights as separate shapes
      over the top read as bars across the face at card size. */
  ends?: string;
  /** A beard sits over the jaw, under the hair. */
  beard?: (h: string) => string;
  /** Marigolds, for the one look that is about the occasion as much as the cut. */
  flowers?: boolean;
}

/* Geometry every look is drawn against, so the pieces line up.
   Face: ellipse centred (150,182), rx 66, ry 80. Crown tops out near y=102.
   Shoulders enter at y=330. Anything above y=96 is off the top of the card,
   which is what makes it a close crop rather than a portrait of a doll. */
const FACE = 'M150 102c37 0 66 36 66 80s-29 80-66 80-66-36-66-80 29-80 66-80z';

const LOOKS: Record<string, Look> = {
  /* --- Short, men --------------------------------------------------------- */
  'HS-101': { // Textured crop — chopped, piecey weight left on top
    hair: HAIR.dark,
    front: (h) => `
      <path d="M84 176c-6-52 28-84 66-84s72 32 66 84c-5-24-11-38-19-46-10 12-24 16-38 12-12-4-22 0-29 10-6 8-11 16-14 24-4-10-8-10-12 0-4-8-8-8-12 0-4-10-6-10-8 0z" fill="${h}"/>
      <path d="M100 130c12 12 30 16 44 8 8-4 16-1 22 8-12-28-38-42-58-34-6 3-9 9-8 18z" fill="#fff" opacity=".14"/>`,
  },
  'HS-102': { // Skin fade — a dense cap that stops high, fading to nothing
    hair: HAIR.jet,
    front: (h) => `
      <path d="M86 168c-4-46 26-76 64-76s68 30 64 76c-8-24-18-36-30-40-14 10-36 12-52 6-14-5-26 0-34 12-5 7-9 14-12 22z" fill="${h}"/>
      <path d="M86 168c2 14 5 24 8 32 2-14 2-26 0-36-3 0-6 2-8 4zm128 0c-2 14-5 24-8 32-2-14-2-26 0-36 3 0 6 2 8 4z" fill="${h}" opacity=".5"/>`,
  },
  'HS-108': { // Buzz cut — one even close cap, hairline low and square
    hair: HAIR.jet,
    front: (h) => `
      <path d="M84 190c-4-60 30-98 66-98s70 38 66 98c-6-16-12-28-20-36-16 10-76 10-92 0-8 8-14 20-20 36z" fill="${h}"/>
      <path d="M96 140c18 10 90 10 108 0-8-30-32-48-54-48s-46 18-54 48z" fill="#fff" opacity=".07"/>`,
  },
  'HS-117': { // French crop with fade — a blunt fringe pushed forward
    hair: HAIR.coffee,
    front: (h) => `
      <path d="M85 172c-5-48 27-80 65-80s70 32 65 80c-6-22-14-34-24-40-18 22-52 26-76 12-12-7-22-2-27 10-2 6-3 12-3 18z" fill="${h}"/>
      <path d="M96 140c22 18 56 16 76-4 6 8 10 16 13 24-6-30-32-50-58-46-16 2-26 12-31 26z" fill="#fff" opacity=".14"/>
      <path d="M86 174c2 12 5 20 8 28-4-12-6-22-8-28zm128 0c-2 12-5 20-8 28 4-12 6-22 8-28z" fill="${h}" opacity=".45"/>`,
  },
  'HS-109': { // Pompadour — a tall wave lifted off the forehead
    hair: HAIR.dark,
    front: (h) => `
      <path d="M86 176c-8-36 0-70 22-88 20-16 48-14 66 4 14 14 22 32 34 40-16 6-28 2-40-6 8 14 20 22 34 26-22 8-42 2-56-10-12-10-26-12-38-4-12 8-20 20-22 38z" fill="${h}"/>
      <path d="M110 100c14-12 34-12 48-2-20-2-36 6-48 22-10 14-14 30-12 46-8-26-2-50 12-66z" fill="#fff" opacity=".16"/>`,
  },
  'HS-112': { // Slick back — a full cap combed flat and straight off the face
    hair: HAIR.jet,
    front: (h) => `
      <path d="M82 192c-6-66 32-100 68-100s74 34 68 100c-5-24-12-40-22-50-18 12-74 12-92 0-10 10-17 26-22 50z" fill="${h}"/>
      <g stroke="#fff" stroke-width="3" opacity=".17" fill="none" stroke-linecap="round">
        <path d="M100 146c20-14 46-17 68-9"/><path d="M94 162c22-15 50-18 72-10"/>
      </g>`,
  },
  'HS-104': { // Beard sculpt — short crop, and a full shaped beard
    hair: HAIR.coffee,
    beard: (h) => `
      <path d="M86 198c2 34 10 62 24 80 12 16 25 24 40 24s28-8 40-24c14-18 22-46 24-80-4 24-12 34-22 38-10 20-24 30-42 30s-32-10-42-30c-10-4-18-14-22-38z" fill="${h}"/>
      <path d="M116 268c22 12 46 12 68 0-8 18-22 28-34 28s-26-10-34-28z" fill="#fff" opacity=".1"/>`,
    front: (h) => `
      <path d="M86 172c-5-48 27-80 64-80s69 32 64 80c-7-24-16-36-28-40-16 10-40 12-58 6-13-4-23 2-29 12-5 7-9 14-13 22z" fill="${h}"/>`,
  },

  /* --- Medium ------------------------------------------------------------- */
  'HS-106': { // Curtain fringe — a centre part sweeping either side of the brow
    hair: HAIR.chestnut,
    back: (h) => `<path d="M76 200c-8-62 28-108 74-108s82 46 74 108c-2 34-8 60-14 78-6-40-10-70-18-88-14 16-70 16-84 0-8 18-12 48-18 88-6-18-12-44-14-78z" fill="${h}"/>`,
    front: (h) => `
      <path d="M82 182c-6-54 30-90 68-90s74 36 68 90c-5-26-12-40-20-48-6 30-16 54-30 68 4-28 0-48-6-60-10 20-26 30-46 32 14-10 22-24 26-40-12 20-30 30-50 30-6 6-10 12-10 18z" fill="${h}"/>`,
  },
  'HS-113': { // Wolf cut — shaggy spikes all the way round
    hair: HAIR.dark,
    back: (h) => `<path d="M74 206c-8-64 30-114 76-114s84 50 76 114c-4 36-12 64-20 84-2-24-6-42-10-54-6 18-12 32-18 42 2-24 0-42-4-54-10 18-66 18-76 0-4 12-6 30-4 54-6-10-12-24-18-42-4 12-8 30-10 54-8-20-16-48-20-84z" fill="${h}"/>`,
    front: (h) => `
      <path d="M80 180c-6-56 32-88 70-88s76 32 70 88c-6-20-12-30-20-38-2 18-8 30-14 40 0-20-4-32-9-40-8 16-20 26-38 28 10-8 16-18 20-30-12 16-30 22-50 22-12 2-22 8-29 18z" fill="${h}"/>
      <path d="M96 138c14 14 40 18 60 10-6 14-16 22-32 22s-24-10-28-32z" fill="#fff" opacity=".12"/>`,
  },
  'HS-103': { // Layer cut — graduated layers falling to the shoulder
    hair: HAIR.chestnut,
    back: (h) => LONG_BACK(h, 350),
    front: (h) => `
      <path d="M80 182c-6-56 32-90 70-90s76 34 70 90c-6-28-15-40-25-48-13 18-41 26-66 20-18-4-30 3-38 13-5 5-9 10-11 15z" fill="${h}"/>
      <g stroke="#fff" stroke-width="2.4" opacity=".14" fill="none" stroke-linecap="round">
        <path d="M92 240c4 26 9 44 14 60"/><path d="M208 240c-4 26-9 44-14 60"/>
      </g>`,
  },
  'HS-115': { // Ash grey highlights — cool ash melting through a dark mid-length
    hair: HAIR.dark,
    ends: HAIR.silver,
    back: (h) => LONG_BACK(h, 340),
    front: (h) => `
      <path d="M82 180c-6-54 31-88 68-88s74 34 68 88c-6-26-15-38-25-46-12 17-39 25-63 19-17-4-29 3-37 12-5 5-9 10-11 15z" fill="${h}"/>`,
  },

  /* --- Long --------------------------------------------------------------- */
  'HS-114': { // Soft waves — long hair with a deep open wave
    hair: HAIR.chestnut,
    back: (h) => LONG_BACK(h, 386),
    front: (h) => `
      <path d="M80 182c-6-56 32-90 70-90s76 34 70 90c-6-28-15-40-25-48-13 18-41 26-66 20-18-4-30 3-38 13-5 5-9 10-11 15z" fill="${h}"/>
      <g stroke="#fff" stroke-width="3" opacity=".15" fill="none" stroke-linecap="round">
        <path d="M92 250c9 9-7 18 2 27s-7 18 2 27"/>
        <path d="M208 250c-9 9 7 18-2 27s7 18-2 27"/>
      </g>`,
  },
  'HS-116': { // Keratin smooth — poker straight, glass shine
    hair: HAIR.jet,
    back: (h) => LONG_BACK(h, 392),
    front: (h) => `
      <path d="M82 180c-6-54 31-88 68-88s74 34 68 88c-6-26-15-38-25-46-13 17-40 25-64 19-18-4-30 3-38 12-4 5-8 10-9 15z" fill="${h}"/>
      <g stroke="#fff" stroke-width="3.2" opacity=".15" fill="none" stroke-linecap="round">
        <path d="M90 240v120"/><path d="M100 250v110"/><path d="M210 240v120"/><path d="M200 250v110"/>
      </g>`,
  },
  'HS-107': { // Balayage caramel — dark roots melting into lit ends
    hair: HAIR.dark,
    ends: HAIR.honey,
    back: (h) => LONG_BACK(h, 392),
    front: (h) => `
      <path d="M80 182c-6-56 32-90 70-90s76 34 70 90c-6-28-15-40-25-48-13 18-41 26-66 20-18-4-30 3-38 13-5 5-9 10-11 15z" fill="${h}"/>`,
  },
  'HS-111': { // Box braids — long sectioned plaits
    hair: HAIR.jet,
    back: (h) => LONG_BACK(h, 392),
    front: (h) => `
      <path d="M82 178c-6-52 31-86 68-86s74 34 68 86c-6-26-15-38-25-46-13 17-40 25-64 19-18-4-30 3-38 12-4 5-8 10-9 15z" fill="${h}"/>
      <g stroke="#fff" stroke-width="2" opacity=".16" fill="none">
        <path d="M104 112v60M128 102v68M150 98v72M172 102v68M196 112v60"/>
      </g>`,
  },
  'HS-105': { // Holud bridal updo — swept up, marigolds at the crown
    hair: HAIR.jet,
    flowers: true,
    front: (h) => `
      <path d="M84 180c-6-54 30-88 66-88 33 0 60 26 66 62 14-10 28-6 33 7 5 14-6 28-24 30-13 2-23-3-28-11-2 13-7 24-13 32 3-28-2-46-10-56-13 17-40 25-64 19-16-4-26 5-26 5z" fill="${h}"/>
      <path d="M198 142c11-11 27-11 35 0 7 10 3 22-8 26-12 4-24-2-28-11-3-7-2-12 1-15z" fill="${h}"/>
      <g stroke="#fff" stroke-width="2.2" opacity=".18" fill="none" stroke-linecap="round">
        <path d="M98 150c18-16 46-20 70-10"/><path d="M92 168c22-18 52-22 78-10"/>
      </g>`,
  },

  /* --- Short, women -------------------------------------------------------- */
  'HS-110': { // Blunt bob — one hard line at the jaw
    hair: HAIR.jet,
    back: (h) => `<path d="M78 200c-6-62 30-108 72-108s78 46 72 108c-1 30-2 54-4 74-18 6-40 9-68 9s-50-3-68-9c-2-20-3-44-4-74z" fill="${h}"/>`,
    front: (h) => `
      <path d="M82 178c-6-52 31-86 68-86s74 34 68 86c-6-26-14-38-24-46-13 17-40 25-64 19-17-4-29 3-37 12-5 5-9 10-11 15z" fill="${h}"/>
      <path d="M78 272c18 6 41 9 72 9s54-3 72-9c0 8-1 14-1 20-18 6-42 9-71 9s-53-3-71-9c0-6-1-12-1-20z" fill="${h}" opacity=".55"/>`,
  },
  'HS-118': { // Curly shag — piled springy curl, big silhouette
    hair: HAIR.coffee,
    back: (h) => `
      <g fill="${h}">
        <circle cx="82" cy="164" r="36"/><circle cx="218" cy="164" r="36"/>
        <circle cx="76" cy="222" r="33"/><circle cx="224" cy="222" r="33"/>
        <circle cx="88" cy="276" r="29"/><circle cx="212" cy="276" r="29"/>
        <circle cx="106" cy="112" r="36"/><circle cx="194" cy="112" r="36"/>
        <circle cx="150" cy="94" r="38"/>
      </g>`,
    front: (h) => `
      <path d="M84 180c-6-54 32-88 66-88s72 34 66 88c-6-26-14-38-24-46-13 17-38 25-62 19-17-4-29 3-36 12-4 5-8 10-10 15z" fill="${h}"/>
      <g fill="${h}">
        <circle cx="98" cy="122" r="21"/><circle cx="132" cy="102" r="22"/>
        <circle cx="170" cy="106" r="21"/><circle cx="200" cy="130" r="19"/>
      </g>
      <g fill="#fff" opacity=".11">
        <circle cx="94" cy="158" r="12"/><circle cx="216" cy="214" r="11"/><circle cx="124" cy="98" r="10"/>
      </g>`,
  },
};

/** The long fall behind the head, mirrored about the centre by construction.
    Relative curves hand-written per style drifted out of symmetry and left a
    square step down one side of every long look. */
const LONG_BACK = (h: string, bottom = 392) => `<path d="M150 92
  C104 92 72 130 72 196 C72 258 76 ${bottom - 70} 82 ${bottom}
  L118 ${bottom} C114 ${bottom - 70} 112 262 112 208
  C130 224 170 224 188 208
  C188 262 186 ${bottom - 70} 182 ${bottom}
  L218 ${bottom} C224 ${bottom - 70} 228 258 228 196
  C228 130 196 92 150 92 Z" fill="${h}"/>`;

/** Anything without a drawing of its own gets a good neutral mid-length. */
const FALLBACK: Look = {
  hair: HAIR.chestnut,
  back: (h) => `<path d="M76 204c-6-64 30-112 74-112s80 48 74 112c-2 36-9 64-17 86-4-26-7-46-11-60-15 17-72 17-87 0-4 14-7 34-11 60-8-22-15-50-17-86z" fill="${h}"/>`,
  front: (h) => `
    <path d="M82 180c-6-54 31-88 68-88s74 34 68 88c-6-26-15-38-25-46-12 17-39 25-63 19-17-4-29 3-37 12-5 5-9 10-11 15z" fill="${h}"/>`,
};

/** Marigolds for the holud updo — pinned at the crown, clear of the face. */
const MARIGOLDS = `
  <g>
    <circle cx="216" cy="130" r="15" fill="#e8a33a"/><circle cx="216" cy="130" r="7" fill="#c2701f"/>
    <circle cx="240" cy="154" r="11" fill="#eeb658"/><circle cx="240" cy="154" r="5" fill="#c2701f"/>
    <circle cx="226" cy="180" r="9" fill="#dd9a35"/><circle cx="226" cy="180" r="4" fill="#b05f18"/>
    <circle cx="196" cy="110" r="10" fill="#f0c273"/><circle cx="196" cy="110" r="4.5" fill="#c2701f"/>
  </g>`;

/** One portrait, as an SVG document. */
function draw(id: string, tone: number): string {
  const look = LOOKS[id] ?? FALLBACK;
  const [deep, light] = GROUND[((tone % 6) + 6) % 6];
  const skin = skinAt(id.charCodeAt(id.length - 1));
  // Coloured hair is painted with a gradient rather than a flat fill, so the
  // lift lands on the ends the way it would in a chair.
  const hair = look.ends ? 'url(#hair)' : look.hair;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400" width="300" height="400">
  <defs>
    <linearGradient id="g" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="${deep}"/><stop offset="1" stop-color="${light}"/>
    </linearGradient>
    <radialGradient id="halo" cx="50%" cy="34%" r="52%">
      <stop offset="0" stop-color="#fff" stop-opacity=".55"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".40" stop-color="#2e2014" stop-opacity="0"/>
      <stop offset="1" stop-color="#2e2014" stop-opacity=".42"/>
    </linearGradient>
    <radialGradient id="vignette" cx="50%" cy="44%" r="62%">
      <stop offset=".55" stop-color="#2e2014" stop-opacity="0"/>
      <stop offset="1" stop-color="#2e2014" stop-opacity=".26"/>
    </radialGradient>
    <linearGradient id="cheek" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#000" stop-opacity=".16"/>
      <stop offset=".45" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    ${look.ends ? `<linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
      <stop offset=".18" stop-color="${look.hair}"/>
      <stop offset=".52" stop-color="${look.hair}"/>
      <stop offset="1" stop-color="${look.ends}"/>
    </linearGradient>` : ''}
  </defs>

  <rect width="300" height="400" fill="url(#g)"/>
  <ellipse cx="150" cy="140" rx="180" ry="170" fill="url(#halo)"/>

  <!-- The whole figure is drawn at portrait scale, then zoomed about the face
       so the crown runs off the top and the shoulders off the sides. A head
       sitting politely inside its frame reads as an avatar; a close crop is
       what makes it read as a photograph of somebody's hair. -->
  <g transform="translate(150 186) scale(1.18) translate(-150 -186) translate(0 -10)">
    ${look.back ? look.back(hair) : ''}

    <path d="M124 246h52v70c0 14-52 14-52 0z" fill="${skin}"/>
    <path d="M124 246h52v26c-18 12-38 12-52 0z" fill="#000" opacity=".16"/>
    <path d="M150 306c54 0 100 34 116 94H34c16-60 62-94 116-94z" fill="${skin}"/>
    <path d="M150 306c54 0 100 34 116 94H34c16-60 62-94 116-94z" fill="url(#shade)" opacity=".6"/>

    <path d="${FACE}" fill="${skin}"/>
    <path d="${FACE}" fill="url(#cheek)"/>
    <path d="M150 102c37 0 66 36 66 80 0 8-1 16-3 23-8-40-33-67-63-67s-55 27-63 67c-2-7-3-15-3-23 0-44 29-80 66-80z" fill="#fff" opacity=".13"/>

    ${look.beard ? look.beard(hair) : ''}
    ${look.front(hair)}
    ${look.flowers ? MARIGOLDS : ''}
  </g>

  <rect width="300" height="400" fill="url(#vignette)"/>
  <rect width="300" height="400" fill="url(#shade)" opacity=".5"/>
</svg>`;
}

const cache = new Map<string, string>();

/** A data URL for one style's portrait, built once per style per session. */
export function hairstyleArt(id: string, tone = 0): string {
  const key = `${id}:${tone}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const url = `data:image/svg+xml,${encodeURIComponent(draw(id, tone))}`;
  cache.set(key, url);
  return url;
}
