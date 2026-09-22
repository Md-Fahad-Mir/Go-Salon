import type { Hairstyle } from '../types';
import { isoDaysAgo, randomFloat, randomInt } from './base';

interface Seed {
  name: string;
  category: string;
  tags: string[];
  generations: number;
  featured?: boolean;
  status?: 'active' | 'inactive';
}

const SEEDS: Seed[] = [
  { name: 'Textured crop', category: 'Haircut', tags: ['men', 'short', 'trending'], generations: 3182, featured: true },
  { name: 'Skin fade', category: 'Haircut', tags: ['men', 'fade', 'barber'], generations: 2740, featured: true },
  { name: 'Layer cut · women', category: 'Haircut', tags: ['women', 'layers', 'medium'], generations: 2106, featured: true },
  { name: 'Beard sculpt', category: 'Beard', tags: ['men', 'beard', 'grooming'], generations: 1684 },
  { name: 'Holud bridal updo', category: 'Bridal', tags: ['women', 'wedding', 'holud', 'festive'], generations: 1402, featured: true },
  { name: 'Curtain fringe', category: 'Styling', tags: ['unisex', 'fringe', 'k-style'], generations: 1188 },
  { name: 'Balayage caramel', category: 'Coloring', tags: ['women', 'colour', 'premium'], generations: 964 },
  { name: 'Buzz cut', category: 'Haircut', tags: ['men', 'short', 'low-maintenance'], generations: 903 },
  { name: 'Keratin smoothing', category: 'Treatment', tags: ['women', 'treatment', 'frizz'], generations: 812 },
  { name: 'Box braids', category: 'Braiding', tags: ['women', 'protective', 'braids'], generations: 744 },
  { name: 'Pompadour', category: 'Styling', tags: ['men', 'classic', 'volume'], generations: 611 },
  { name: 'Blunt bob', category: 'Haircut', tags: ['women', 'short', 'sleek'], generations: 588 },
  { name: 'Ash grey highlights', category: 'Coloring', tags: ['unisex', 'colour', 'bold'], generations: 402, status: 'inactive' },
  { name: 'Mehndi party waves', category: 'Bridal', tags: ['women', 'wedding', 'waves'], generations: 356 },
];

export const mockHairstyles: Hairstyle[] = SEEDS.map((seed, index) => ({
  id: `HS-${String(101 + index)}`,
  name: seed.name,
  category: seed.category,
  image: `/hairstyles/${seed.name.toLowerCase().replace(/[^a-z]+/g, '-')}.jpg`,
  tags: seed.tags,
  description: `${seed.name} — reference look used by the generator for ${seed.category.toLowerCase()} requests.`,
  generationCount: seed.generations,
  featured: seed.featured ?? false,
  status: seed.status ?? 'active',
  successRate: randomFloat(88, 98, 1),
  createdAt: isoDaysAgo(randomInt(30, 380)),
}));
