import { z } from 'zod'

export const qualifyingActivitySchema = z.enum(['repair', 'secondhand_purchase', 'donation', 'recycling'])
export type QualifyingActivity = z.infer<typeof qualifyingActivitySchema>
export const activityReceiptSchema = z.object({
  id: z.uuid(), partnerId: z.string(), partnerName: z.string(), activity: qualifyingActivitySchema,
  credits: z.number().int().positive(), occurredAt: z.string().datetime(), confirmedAt: z.string().datetime(),
  status: z.enum(['confirmed', 'reversed']), reversalReason: z.enum(['returned', 'cancelled', 'rejected']).nullable(),
})
export type ActivityReceipt = z.infer<typeof activityReceiptSchema>
export const activityEvidenceSnapshotSchema = z.object({
  enabled: z.boolean(), verifiedActivityCredits: z.number().int().nonnegative(),
  partners: z.array(z.object({ id: z.string(), name: z.string(), activities: z.array(qualifyingActivitySchema) })),
  receipts: z.array(activityReceiptSchema),
})
export type ActivityEvidenceSnapshot = z.infer<typeof activityEvidenceSnapshotSchema>
export const activityRequestInputSchema = z.object({ partnerId: z.string().min(1).max(64), activity: qualifyingActivitySchema }).strict()
export const activityRequestResponseSchema = z.object({ code: z.string().length(43), expiresAt: z.string().datetime() })
