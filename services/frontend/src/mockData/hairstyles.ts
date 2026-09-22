import type { Hairstyle } from '../types';

const ALL_HAIR: Hairstyle['hairTypes'] = ['straight', 'wavy', 'curly', 'coily'];
const ALL_FACES: Hairstyle['faceShapes'] = ['oval', 'round', 'square', 'heart', 'oblong'];
const ALL_OCCASIONS: Hairstyle['occasions'] = ['casual', 'formal', 'wedding', 'party', 'business', 'date'];

export const mockHairstyles: Hairstyle[] = [
  {
    id: 'HS-101', name: 'Textured crop', category: 'Haircut', audience: 'men',
    tags: ['short', 'trending', 'low-maintenance'], occasions: ['casual', 'business', 'date'],
    faceShapes: ['oval', 'square', 'oblong'], hairTypes: ['straight', 'wavy'], length: 'short',
    description: 'Short on the sides with a choppy, textured top you can push forward or mess up. Works with a natural wave and takes almost no styling in the morning.',
    tryOns: 3182, rating: 4.8, maintenance: 'low', tone: 0, featured: true, trending: true,
  },
  {
    id: 'HS-102', name: 'Skin fade', category: 'Haircut', audience: 'men',
    tags: ['fade', 'barber', 'sharp'], occasions: ['casual', 'party', 'date'],
    faceShapes: ['oval', 'round', 'square'], hairTypes: ALL_HAIR, length: 'short',
    description: 'A blended fade taken right down to the skin, with the top left longer for shape. Looks sharpest for the first two weeks, so plan a regular tidy-up.',
    tryOns: 2740, rating: 4.9, maintenance: 'medium', tone: 1, featured: true, trending: true,
  },
  {
    id: 'HS-103', name: 'Layer cut', category: 'Haircut', audience: 'women',
    tags: ['layers', 'movement', 'medium'], occasions: ['casual', 'formal', 'business'],
    faceShapes: ['oval', 'round', 'heart'], hairTypes: ['straight', 'wavy', 'curly'], length: 'medium',
    description: 'Soft, graduated layers that add movement without losing length. Frames the face and makes thick hair feel lighter.',
    tryOns: 2106, rating: 4.7, maintenance: 'low', tone: 2, featured: true, trending: true,
  },
  {
    id: 'HS-104', name: 'Beard sculpt', category: 'Beard', audience: 'men',
    tags: ['beard', 'grooming'], occasions: ALL_OCCASIONS,
    faceShapes: ALL_FACES, hairTypes: ALL_HAIR, length: 'short',
    description: 'Cheek and neck lines cleaned up, length shaped to the jaw and finished with oil. Pairs with any cut.',
    tryOns: 1684, rating: 4.6, maintenance: 'medium', tone: 3, featured: false, trending: false,
  },
  {
    id: 'HS-105', name: 'Holud bridal updo', category: 'Bridal', audience: 'women',
    tags: ['wedding', 'holud', 'festive', 'updo'], occasions: ['wedding', 'party'],
    faceShapes: ['oval', 'heart', 'oblong'], hairTypes: ALL_HAIR, length: 'long',
    description: 'A low, textured updo built for marigold and jasmine, with soft face-framing pieces. Holds through a full evening of dancing.',
    tryOns: 1402, rating: 4.9, maintenance: 'high', tone: 5, featured: true, trending: false,
  },
  {
    id: 'HS-106', name: 'Curtain fringe', category: 'Styling', audience: 'unisex',
    tags: ['fringe', 'k-style', 'soft'], occasions: ['casual', 'date'],
    faceShapes: ['oval', 'oblong', 'square'], hairTypes: ['straight', 'wavy'], length: 'medium',
    description: 'A centre-parted fringe that sweeps to either side and softens a long face. Grows out gracefully.',
    tryOns: 1188, rating: 4.7, maintenance: 'medium', tone: 4, featured: false, trending: true,
  },
  {
    id: 'HS-107', name: 'Balayage caramel', category: 'Coloring', audience: 'women',
    tags: ['colour', 'premium', 'warm'], occasions: ALL_OCCASIONS,
    faceShapes: ALL_FACES, hairTypes: ALL_HAIR, length: 'long',
    description: 'Hand-painted caramel through the mid-lengths and ends for a sun-lit finish with no harsh regrowth line.',
    tryOns: 964, rating: 4.8, maintenance: 'high', tone: 0, featured: false, trending: false,
  },
  {
    id: 'HS-108', name: 'Buzz cut', category: 'Haircut', audience: 'men',
    tags: ['short', 'low-maintenance', 'clean'], occasions: ['casual', 'business'],
    faceShapes: ['oval', 'square', 'oblong'], hairTypes: ALL_HAIR, length: 'short',
    description: 'One clipper length all over. Zero styling, and a line-up keeps it looking intentional.',
    tryOns: 903, rating: 4.5, maintenance: 'low', tone: 1, featured: false, trending: false,
  },
  {
    id: 'HS-109', name: 'Pompadour', category: 'Styling', audience: 'men',
    tags: ['classic', 'volume', 'retro'], occasions: ['formal', 'wedding', 'party', 'date'],
    faceShapes: ['round', 'square', 'heart'], hairTypes: ['straight', 'wavy'], length: 'medium',
    description: 'Height at the front swept up and back, tight at the sides. Needs a blow-dry and a good pomade.',
    tryOns: 611, rating: 4.6, maintenance: 'high', tone: 2, featured: false, trending: false,
  },
  {
    id: 'HS-110', name: 'Blunt bob', category: 'Haircut', audience: 'women',
    tags: ['short', 'sleek', 'sharp'], occasions: ['casual', 'business', 'formal'],
    faceShapes: ['oval', 'heart', 'oblong'], hairTypes: ['straight', 'wavy'], length: 'short',
    description: 'One clean line at the jaw with no layers. Makes fine hair look thicker and reads polished with almost no effort.',
    tryOns: 588, rating: 4.7, maintenance: 'medium', tone: 3, featured: false, trending: true,
  },
  {
    id: 'HS-111', name: 'Box braids', category: 'Braiding', audience: 'women',
    tags: ['protective', 'braids', 'long'], occasions: ['casual', 'party'],
    faceShapes: ALL_FACES, hairTypes: ['curly', 'coily'], length: 'long',
    description: 'Medium box braids with extensions for length. A protective style that lasts six to eight weeks.',
    tryOns: 744, rating: 4.8, maintenance: 'low', tone: 4, featured: false, trending: false,
  },
  {
    id: 'HS-112', name: 'Slick back', category: 'Styling', audience: 'men',
    tags: ['classic', 'formal', 'sleek'], occasions: ['formal', 'business', 'wedding'],
    faceShapes: ['oval', 'round', 'heart'], hairTypes: ['straight', 'wavy'], length: 'medium',
    description: 'Combed straight back with a wet-look finish. Best from ear-length hair upward.',
    tryOns: 502, rating: 4.5, maintenance: 'medium', tone: 5, featured: false, trending: false,
  },
  {
    id: 'HS-113', name: 'Wolf cut', category: 'Haircut', audience: 'unisex',
    tags: ['shag', 'layers', 'edgy'], occasions: ['casual', 'party', 'date'],
    faceShapes: ['oval', 'oblong', 'heart'], hairTypes: ['wavy', 'curly'], length: 'medium',
    description: 'Heavy layers on top, wispy ends below — a mullet and a shag that met halfway. Loves natural texture.',
    tryOns: 877, rating: 4.6, maintenance: 'medium', tone: 0, featured: false, trending: true,
  },
  {
    id: 'HS-114', name: 'Soft waves', category: 'Styling', audience: 'women',
    tags: ['waves', 'blowout', 'romantic'], occasions: ['date', 'party', 'wedding'],
    faceShapes: ALL_FACES, hairTypes: ['straight', 'wavy'], length: 'long',
    description: 'Loose, brushed-out waves from a round-brush blow-dry. Lasts a night out, not a week.',
    tryOns: 690, rating: 4.7, maintenance: 'medium', tone: 1, featured: false, trending: false,
  },
  {
    id: 'HS-115', name: 'Ash grey highlights', category: 'Coloring', audience: 'unisex',
    tags: ['colour', 'bold', 'cool'], occasions: ['party', 'casual'],
    faceShapes: ALL_FACES, hairTypes: ALL_HAIR, length: 'medium',
    description: 'Cool ash ribbons over dark hair. Needs a pre-lightening session and a purple shampoo at home.',
    tryOns: 402, rating: 4.4, maintenance: 'high', tone: 2, featured: false, trending: false,
  },
  {
    id: 'HS-116', name: 'Keratin smooth', category: 'Treatment', audience: 'women',
    tags: ['treatment', 'frizz', 'sleek'], occasions: ALL_OCCASIONS,
    faceShapes: ALL_FACES, hairTypes: ALL_HAIR, length: 'long',
    description: 'A smoothing treatment that tames frizz for up to three months. Same length, far less morning effort.',
    tryOns: 812, rating: 4.7, maintenance: 'low', tone: 3, featured: false, trending: false,
  },
  {
    id: 'HS-117', name: 'French crop with fade', category: 'Haircut', audience: 'men',
    tags: ['crop', 'fade', 'fringe'], occasions: ['casual', 'business'],
    faceShapes: ['round', 'square', 'oval'], hairTypes: ['straight', 'wavy', 'curly'], length: 'short',
    description: 'A short, blunt fringe over a mid fade. Hides a receding corner and works on coarse hair.',
    tryOns: 733, rating: 4.7, maintenance: 'low', tone: 4, featured: false, trending: false,
  },
  {
    id: 'HS-118', name: 'Curly shag', category: 'Haircut', audience: 'women',
    tags: ['curls', 'shag', 'volume'], occasions: ['casual', 'party'],
    faceShapes: ['oval', 'heart', 'oblong'], hairTypes: ['curly', 'coily'], length: 'medium',
    description: 'Cut dry, curl by curl, so the layers sit where your hair actually falls. Big, soft volume with a light fringe.',
    tryOns: 655, rating: 4.6, maintenance: 'low', tone: 5, featured: false, trending: false,
  },
];

export const getHairstyle = (id: string): Hairstyle | undefined =>
  mockHairstyles.find((style) => style.id === id);
