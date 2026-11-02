import { createHash, randomBytes } from 'node:crypto'
import { recoveredReceiptSchema, voucherActionResponseSchema, offersResponseSchema, redeemOfferResponseSchema, type OffersResponse, type RedeemOfferResponse } from '../../../shared/src/index.js'
import { DEMO_OFFERS } from '../domain/offerCatalogue.js'
import { ApplicationError } from './applicationError.js'
import type { EcoScanStore } from './ports.js'
import { sessionSubject, type RewardSafetyService } from './rewardSafety.js'

export class OfferService {
  constructor(private readonly store: Pick<EcoScanStore, 'getRewards' | 'redeemOnce' | 'settleRedemption' | 'ownerForReceipt' | 'saveRecoveryKey' | 'recoverReceipt'>, private readonly safety?: RewardSafetyService) {}

  async createRecovery(sessionId: string, offerId: string) {
    const recoveryKey = randomBytes(32).toString('base64url')
    const saved = await this.store.saveRecoveryKey(sessionId, offerId, recoveryHash(recoveryKey))
    return { recoveryKey, ...saved }
  }

  async recover(recoveryKey: string) {
    const archived = await this.store.recoverReceipt(recoveryHash(recoveryKey))
    if (!archived) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'Recovery key is invalid or expired.')
    return recoveredReceiptSchema.parse({ ...archived, title: DEMO_OFFERS.find(offer => offer.id === archived.offerId)?.title ?? 'Saved receipt', readOnly: true })
  }

  async list(sessionId: string): Promise<OffersResponse> {
    const rewards = await this.store.getRewards(sessionId)
    return offersResponseSchema.parse({
      demoPointsBalance: rewards.demoPointsBalance,
      offers: DEMO_OFFERS.map((offer) => {
        const receipt = rewards.redemptions.find((item) => item.offerId === offer.id) ?? null
        const redeemed = receipt !== null
        return { ...offer, expired: Date.parse(offer.expiresAt) <= Date.now(), redeemed, receipt: receipt ? { reference: receipt.reference, redeemedAt: receipt.redeemedAt, expiresAt: receipt.expiresAt, status: receipt.status } : null, remaining: rewards.inventory?.[offer.id] ?? 0,
          canRedeem: !redeemed && Date.parse(offer.expiresAt) > Date.now() && (rewards.inventory?.[offer.id] ?? 0) > 0 && rewards.demoPointsBalance >= offer.pointsCost }
      }),
    })
  }

  async redeem(sessionId: string, offerId: string): Promise<RedeemOfferResponse> {
    const offer = DEMO_OFFERS.find((candidate) => candidate.id === offerId)
    if (!offer) throw new ApplicationError('OFFER_NOT_FOUND', 'This demo offer does not exist.')
    const previous = (await this.store.getRewards(sessionId)).redemptions.find(item => item.offerId === offerId)
    if (!previous) await this.safety?.assertAllowed(sessionSubject(sessionId))
    if (!previous && Date.parse(offer.expiresAt) <= Date.now()) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'This offer has expired.')
    const { demoPointsBalance, receipt } = await this.store.redeemOnce(sessionId, offer.id, offer.pointsCost)
    return redeemOfferResponseSchema.parse({
      offerId: offer.id, demoPointsBalance, receipt,
      message: receipt.status === 'refunded' ? 'This demo voucher was already refunded. No points were deducted.' : receipt.status === 'used' ? 'This demo voucher was already fulfilled.' : receipt.status === 'expired' ? 'This demo voucher has expired; you may refund it if unused.' : `${offer.title} added to your demo rewards. No real product or voucher is issued.`,
    })
  }
  async refund(sessionId: string, offerId: string) {
    return voucherActionResponseSchema.parse(await this.store.settleRedemption(sessionId, offerId, 'refund'))
  }

  async fulfilDemo(sessionId: string, offerId: string) {
    if (!DEMO_OFFERS.some(offer => offer.id === offerId && offer.partner === 'EcoScan demo partner')) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'Only demo vouchers support simulated fulfilment.')
    return voucherActionResponseSchema.parse(await this.store.settleRedemption(sessionId, offerId, 'use'))
  }

  async fulfil(reference: string) {
    const owner = await this.store.ownerForReceipt(reference)
    if (!owner) throw new ApplicationError('VOUCHER_UNAVAILABLE', 'Voucher not found.')
    return voucherActionResponseSchema.parse(await this.store.settleRedemption(owner.sessionId, owner.offerId, 'use'))
  }

}

export const recoveryHash = (key: string) => createHash('sha256').update('ecoscan-receipt-v1:' + key).digest('hex')
