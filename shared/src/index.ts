import { z } from 'zod'

export const clothingCategorySchema = z.enum(['tshirt', 'jeans', 'jacket', 'shoes'])
export type ClothingCategory = z.infer<typeof clothingCategorySchema>

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

export const estimatedItemSchema = confirmedItemSchema.extend({
  estimatedProductionKgCo2e: z.number().nonnegative(),
})

export const scanEstimateSchema = z.object({
  items: z.array(estimatedItemSchema).min(1),
  totalEstimatedProductionKgCo2e: z.number().nonnegative(),
  scenarioPotentialAvoidedKgCo2e: z.number().nonnegative(),
  demoPointsAwarded: z.number().int().nonnegative(),
  rewardStatus: z.enum(['awarded', 'not_replacing', 'unverified_items', 'duplicate_image']).optional(),
  assumptionsVersion: z.enum(['demo-v1', 'demo-v2']),
})

export type ScanEstimate = z.infer<typeof scanEstimateSchema>

export const confirmScanResponseSchema = scanEstimateSchema.extend({
  demoPointsBalance: z.number().int().nonnegative(),
})

export type ConfirmScanResponse = z.infer<typeof confirmScanResponseSchema>

export const latestScanResponseSchema = z.object({ result: confirmScanResponseSchema.nullable() })

export const demoReceiptSchema = z.object({
  reference: z.string().min(1),
  redeemedAt: z.string().datetime(),
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
