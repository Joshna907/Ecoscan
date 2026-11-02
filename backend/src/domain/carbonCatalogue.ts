import { loadFactorImport } from './factorImport.js'
import type { ClothingCategory, MaterialType } from '../../../shared/src/index.js'

// Illustrative values from the take-home brief, in kg CO2e per comparable new item.
// Replace only when a sourced lifecycle dataset and its uncertainty are documented.
export const ASSUMPTIONS_VERSION = 'materials-v2' as const
export const PRODUCTION_KG_CO2E: Readonly<Record<ClothingCategory, number>> = {
  tshirt: 5,
  jeans: 10,
  jacket: 15,
  shoes: 8,
}

export interface Range { low: number; central: number; high: number }

// Per-garment mass ranges in grams. These are screening defaults, not measurements.
// Supplying a garment weight replaces the range with that user-confirmed measurement.
export { GARMENT_WEIGHT_GRAMS } from '../../../shared/src/index.js'

export const MATERIAL_FACTOR_DATASET_VERSION = 'ecoscan-material-factors-v2' as const

// Screening sensitivity ranges in kg CO2e per kg of fibre at the factory gate.
// They are model scenarios, not empirical study variation.
// They must not be added to the whole-garment benchmark because their boundaries overlap.
// Sourced central values: Sustainability 2021, 13(5), 2498, Figure 4A.
// The paper reports impacts for 264 g fibre. Divide those rounded values by
// 0.264 kg. Low/high are explicit EcoScan sensitivity scenarios (0.5x/1.5x),
// NOT observed extrema or confidence intervals. Unsupported materials have no proxy.
const fibreFactor = (impactFor264g: number): Range => {
  const central = impactFor264g / 0.264
  return { low: central * 0.5, central, high: central * 1.5 }
}
export const MATERIAL_KG_CO2E_PER_KG: Readonly<Partial<Record<MaterialType, Range>>> = {
  cotton: fibreFactor(1.2), polyester: fibreFactor(1.1), nylon: fibreFactor(2.7),
  wool: fibreFactor(9.7), linen: fibreFactor(0.4), viscose: fibreFactor(0.9), acrylic: fibreFactor(1.1),
}

// Sources and boundary notes are exposed in documentation/UI, not hidden as “AI facts”.
export const MATERIAL_FACTOR_SOURCES = [
  {
    title: 'Factors Allowing Users to Influence the Environmental Performance of Their T-Shirt (2021)',
    url: 'https://doi.org/10.3390/su13052498',
    note: 'Figure 4A: impacts per 264 g fibre divided by 0.264 kg; EcoScan sensitivity envelope is 50–150% of central.',
  },
  {
    title: 'EU Product Environmental Footprint Category Rules for apparel and footwear',
    url: 'https://environment.ec.europa.eu/news/new-eu-rules-measuring-environmental-impact-clothes-and-shoes-2025-06-25_en',
    note: 'Defines the broader lifecycle context that a full product footprint would require.',
  },
] as const

// A demo scenario assumption, not a measured or verified carbon saving.
export const DEMO_DISPLACEMENT_FACTOR = 0.5
export const DEMO_POINTS_PER_SCENARIO_KG = 10

// Resolve after the entry point loads environment configuration, not during ESM import.
export function getMaterialDataset() {
  const imported = loadFactorImport()
  return imported ? { version: imported.version, factors: imported.factors, sources: Object.values(imported.factors).map(factor => ({ title: factor!.source.title, url: factor!.source.url, note: factor!.source.reference + '; ' + factor!.source.method + '; ' + factor!.source.geography + '; ' + factor!.source.year })) } : { version: MATERIAL_FACTOR_DATASET_VERSION, factors: MATERIAL_KG_CO2E_PER_KG, sources: MATERIAL_FACTOR_SOURCES }
}
