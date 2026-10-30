import type { ClothingCategory } from '../../../shared/src/index.js'

// Illustrative values from the take-home brief, in kg CO2e per comparable new item.
// Replace only when a sourced lifecycle dataset and its uncertainty are documented.
export const ASSUMPTIONS_VERSION = 'demo-v1' as const
export const PRODUCTION_KG_CO2E: Readonly<Record<ClothingCategory, number>> = {
  tshirt: 5,
  jeans: 10,
  jacket: 15,
  shoes: 8,
}

// A demo scenario assumption, not a measured or verified carbon saving.
export const DEMO_DISPLACEMENT_FACTOR = 0.5
export const DEMO_POINTS_PER_SCENARIO_KG = 10
