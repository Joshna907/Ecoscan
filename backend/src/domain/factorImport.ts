import { z } from 'zod'
import { readFileSync } from 'node:fs'
import { materialTypeSchema } from '../../../shared/src/index.js'

const sourcedFactor = z.object({
  low: z.number().nonnegative(), central: z.number().positive(), high: z.number().positive(),
  source: z.object({ title: z.string().min(3), url: z.url().startsWith('https://'), reference: z.string().min(3), method: z.string().min(3), geography: z.string().min(2), year: z.number().int().min(1990), license: z.string().min(3) }),
}).refine(value => value.low <= value.central && value.central <= value.high, 'Ordered factor ranges required')

export const factorImportSchema = z.object({
  version: z.string().min(3), unit: z.literal('kg CO2e/kg fibre'),
  boundary: z.literal('fibre production, cradle-to-gate'),
  review: z.object({ reviewer:z.string().min(3), reviewedAt:z.string().datetime(), assessmentMethod:z.string().min(3), unitsChecked:z.literal(true), boundaryChecked:z.literal(true), softwareUsePermitted:z.literal(true) }).strict(),
  factors: z.partialRecord(materialTypeSchema, sourcedFactor),
}).refine(value => Object.keys(value.factors).length > 0, 'At least one sourced factor is required')
  .refine(value => Object.values(value.factors).every(factor=>factor?.source.method===value.review.assessmentMethod),'All factors must use the reviewed assessment method')
  .refine(value => !value.factors.other && !value.factors.leather,'Unspecified materials and finished leather cannot be imported as fibre-production factors')

// A reviewed/licensed snapshot replaces the dataset as a whole; it is not silently
// mixed into another study. Missing factors stay unsupported.
export function loadFactorImport(path = process.env.MATERIAL_FACTORS_FILE) {
  return path ? factorImportSchema.parse(JSON.parse(readFileSync(path, 'utf8'))) : undefined
}
