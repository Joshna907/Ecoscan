import { offersResponseSchema, redeemOfferResponseSchema, type OffersResponse, type RedeemOfferResponse } from '../../../shared/src/index.js'
import { DEMO_OFFERS } from '../domain/offerCatalogue.js'
import { ApplicationError } from './applicationError.js'
import type { EcoScanStore } from './ports.js'

export class OfferService {
  constructor(private readonly store: Pick<EcoScanStore, 'getRewards' | 'redeemOnce'>) {}

  async list(sessionId: string): Promise<OffersResponse> {
    const rewards = await this.store.getRewards(sessionId)
    return offersResponseSchema.parse({
      demoPointsBalance: rewards.demoPointsBalance,
      offers: DEMO_OFFERS.map((offer) => {
        const receipt = rewards.redemptions.find((item) => item.offerId === offer.id) ?? null
        const redeemed = receipt !== null
        return { ...offer, redeemed, receipt: receipt ? { reference: receipt.reference, redeemedAt: receipt.redeemedAt } : null,
          canRedeem: !redeemed && rewards.demoPointsBalance >= offer.pointsCost }
      }),
    })
  }

  async redeem(sessionId: string, offerId: string): Promise<RedeemOfferResponse> {
    const offer = DEMO_OFFERS.find((candidate) => candidate.id === offerId)
    if (!offer) throw new ApplicationError('OFFER_NOT_FOUND', 'This demo offer does not exist.')
    const { demoPointsBalance, receipt } = await this.store.redeemOnce(sessionId, offer.id, offer.pointsCost)
    return redeemOfferResponseSchema.parse({
      offerId: offer.id, demoPointsBalance, receipt,
      message: `${offer.title} added to your demo rewards. No real product or voucher is issued.`,
    })
  }
}
