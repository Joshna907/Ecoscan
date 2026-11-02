import { z } from 'zod'
export * from './activityEvidence.js'

export const clothingCategorySchema = z.enum(['tshirt', 'jeans', 'jacket', 'shoes'])
export type ClothingCategory = z.infer<typeof clothingCategorySchema>

export const materialTypeSchema = z.enum([
  'cotton', 'polyester', 'nylon', 'wool', 'linen', 'viscose', 'acrylic', 'elastane', 'leather', 'other',
])
export type MaterialType = z.infer<typeof materialTypeSchema>

export const materialComponentSchema = z.object({
  material: materialTypeSchema,
  percentage: z.number().positive().max(100),
})
export type MaterialComponent = z.infer<typeof materialComponentSchema>

export const garmentComponentSchema = z.object({
  kind: z.enum(['shell', 'lining', 'padding', 'upper', 'sole']),
  weightGrams: z.number().positive().max(5000),
  composition: z.array(materialComponentSchema).min(1).max(6),
}).superRefine((value, context) => {
  if (new Set(value.composition.map(part => part.material)).size !== value.composition.length || Math.abs(value.composition.reduce((sum, part) => sum + part.percentage, 0) - 100) > 0.000001) context.addIssue({ code: 'custom', message: 'Use unique fibres totaling 100% for each component.' })
})
export type GarmentComponent = z.infer<typeof garmentComponentSchema>

export const materialProfileSchema = z.object({
  composition: z.array(materialComponentSchema).max(6),
  components: z.array(garmentComponentSchema).min(1).max(5).optional(),
  source: z.enum(['care_label_ocr', 'manual']),
  userConfirmed: z.literal(true),
  weightGrams: z.number().int().min(20).max(5000).optional(),
}).superRefine((value, context) => {
  if (new Set(value.composition.map((part) => part.material)).size !== value.composition.length) {
    context.addIssue({ code: 'custom', path: ['composition'], message: 'Each material can appear only once.' })
  }
  if (value.components) {
    if (value.composition.length || !value.weightGrams || value.components.reduce((sum, component) => sum + component.weightGrams, 0) > value.weightGrams + 0.000001 || new Set(value.components.map(component => component.kind)).size !== value.components.length) context.addIssue({ code: 'custom', message: 'Component mode requires unique components, total item weight and component masses no greater than item mass. Do not also enter a whole-item blend.' })
  } else if (Math.abs(value.composition.reduce((sum, part) => sum + part.percentage, 0) - 100) > 0.000001) {
    context.addIssue({ code: 'custom', path: ['composition'], message: 'Material percentages must total 100.' })
  }
})
export type MaterialProfile = z.infer<typeof materialProfileSchema>

export const materialRecognitionResponseSchema = z.object({
  recognitionMode: z.enum(['mock', 'vision']),
  materials: z.array(materialComponentSchema).max(6),
  needsConfirmation: z.literal(true),
})
export type MaterialRecognitionResponse = z.infer<typeof materialRecognitionResponseSchema>

export const analysisResponseSchema = z.object({
  analysisId: z.uuid(),
  recognitionMode: z.enum(['mock', 'vision']),
  suggestions: z.array(z.object({
    id: z.string().min(1),
    category: clothingCategorySchema,
  })),
  needsReview: z.literal(true),
})

export type AnalysisResponse = z.infer<typeof analysisResponseSchema>

export const analysisJobStatusSchema = z.discriminatedUnion('status', [
  z.object({ analysisId: z.uuid(), status: z.literal('queued') }),
  z.object({ analysisId: z.uuid(), status: z.literal('processing') }),
  z.object({ analysisId: z.uuid(), status: z.literal('failed') }),
  z.object({ analysisId: z.uuid(), status: z.literal('confirmed') }),
  analysisResponseSchema.extend({ status: z.literal('ready') }),
])
export type AnalysisJobStatus = z.infer<typeof analysisJobStatusSchema>

export const confirmedItemSchema = z.object({
  category: clothingCategorySchema,
  quantity: z.number().int().min(1).max(10),
  materialProfile: materialProfileSchema.optional(),
})

export const confirmScanRequestSchema = z.object({
  analysisId: z.string().min(1),
  items: z.array(confirmedItemSchema).min(1).max(10),
  replacesPlannedNewPurchase: z.boolean(),
}).superRefine((value, context) => {
  const total = value.items.reduce((sum, item) => sum + item.quantity, 0)
  if (total > 10) context.addIssue({ code: 'custom', path: ['items'], message: 'A scan can contain at most 10 items.' })
})

export type ConfirmScanRequest = z.infer<typeof confirmScanRequestSchema>

export const co2eRangeSchema = z.object({
  low: z.number().nonnegative(),
  central: z.number().nonnegative(),
  high: z.number().nonnegative(),
}).refine((range) => range.low <= range.central && range.central <= range.high, {
  message: 'The range must be ordered from low to high.',
})
export type Co2eRange = z.infer<typeof co2eRangeSchema>

export const estimatedItemSchema = confirmedItemSchema.extend({
  materialCoverage: z.object({ status:z.enum(['complete','partial','unsupported']),supportedMassGrams:z.number().nonnegative(),uncoveredMassGrams:z.number().nonnegative(),unallocatedMassGrams:z.number().nonnegative(),missingFactors:z.array(z.object({ material:materialTypeSchema,weightGrams:z.number().nonnegative(),component:z.string().optional() })) }).optional(),
  estimatedProductionKgCo2e: z.number().nonnegative(),
  estimatedProductionRangeKgCo2e: co2eRangeSchema,
  materialStageKgCo2e: co2eRangeSchema.optional(),
  materialCoverageGrams: z.number().nonnegative().optional(),
  effectiveWeightGrams: z.object({
    low: z.number().positive(), central: z.number().positive(), high: z.number().positive(),
    source: z.enum(['measured', 'category_range']),
  }).optional(),
})

export const scanEstimateSchema = z.object({
  items: z.array(estimatedItemSchema).min(1),
  totalEstimatedProductionKgCo2e: z.number().nonnegative(),
  totalEstimatedProductionRangeKgCo2e: co2eRangeSchema,
  scenarioPotentialAvoidedKgCo2e: z.number().nonnegative(),
  scenarioPotentialAvoidedRangeKgCo2e: co2eRangeSchema,
  materialStageKgCo2e: co2eRangeSchema.optional(),
  materialProfiledQuantity: z.number().int().nonnegative(),
  totalQuantity: z.number().int().positive(),
  demoPointsAwarded: z.number().int().nonnegative(),
  verification: z.object({ garmentOwnership: z.literal(false), avoidedPurchase: z.literal(false), rewardValue: z.literal('demo_only') }).optional(),
  rewardStatus: z.enum(['awarded', 'not_replacing', 'unverified_items', 'duplicate_image', 'reward_limit']).optional(),
  assumptionsVersion: z.enum(['demo-v1', 'demo-v2', 'materials-v1','materials-v2']),
  factorDatasetVersion: z.string().min(3),
  factorSources: z.array(z.object({ title: z.string(), url: z.url(), note: z.string() })).optional(),
  lifecycleBoundary: z.object({
    categoryBenchmark: z.literal('illustrative whole-garment production benchmark'),
    materialStage: z.literal('fibre production, cradle-to-gate'),
  }),
})

export type ScanEstimate = z.infer<typeof scanEstimateSchema>

export const confirmScanResponseSchema = scanEstimateSchema.extend({
  demoPointsBalance: z.number().int().nonnegative(),
})

export type ConfirmScanResponse = z.infer<typeof confirmScanResponseSchema>

export const latestScanResponseSchema = z.object({ result: confirmScanResponseSchema.nullable(), legacyResult: z.boolean().optional() })

export const demoReceiptSchema = z.object({
  reference: z.string().min(1),
  redeemedAt: z.string().datetime(),
  expiresAt: z.string().datetime().optional(),
  status: z.enum(['issued', 'used', 'refunded', 'expired']).optional(),
})
export type DemoReceipt = z.infer<typeof demoReceiptSchema>

export const offerSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  pointsCost: z.number().int().positive(),
  canRedeem: z.boolean(),
  redeemed: z.boolean(),
  receipt: demoReceiptSchema.nullable(),
  partner: z.string().optional(),
  terms: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
  remaining: z.number().int().nonnegative().optional(),
  expired: z.boolean().optional(),
})

export const offersResponseSchema = z.object({
  demoPointsBalance: z.number().int().nonnegative(),
  offers: z.array(offerSchema),
})

export type OffersResponse = z.infer<typeof offersResponseSchema>

export const redeemOfferResponseSchema = z.object({
  offerId: z.string(),
  demoPointsBalance: z.number().int().nonnegative(),
  message: z.string(),
  receipt: demoReceiptSchema,
})

export type RedeemOfferResponse = z.infer<typeof redeemOfferResponseSchema>

// Screening bounds around ADEME 2018 reference masses; see docs/MATERIAL_METHODOLOGY.md.
export const GARMENT_WEIGHT_GRAMS: Readonly<Record<ClothingCategory, { low: number; central: number; high: number }>> = {
  tshirt: { low: 130, central: 200, high: 300 },
  jeans: { low: 450, central: 800, high: 900 },
  jacket: { low: 350, central: 700, high: 1900 },
  shoes: { low: 500, central: 800, high: 1200 },
}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

export const voucherActionResponseSchema = z.object({ demoPointsBalance: z.number().int().nonnegative(), receipt: demoReceiptSchema })

export const recoveryKeyResponseSchema = z.object({ recoveryKey: z.string().length(43), recoveryExpiresAt: z.string().datetime() })
export const recoveredReceiptSchema = z.object({ offerId: z.string(), title: z.string(), receipt: demoReceiptSchema, recoveryExpiresAt: z.string().datetime(), readOnly: z.literal(true) })
export type RecoveredReceipt = z.infer<typeof recoveredReceiptSchema>
