export interface DemoOffer {
  id: string
  title: string
  description: string
  pointsCost: number
  partner: string
  terms: string
  expiresAt: string
}

// These are product-demo examples. Redeeming one does not issue a real voucher.
export const DEMO_OFFERS: readonly DemoOffer[] = [
  {
    id: 'repair-kit',
    title: 'Clothing repair kit',
    description: 'A sample reward for keeping clothes in use longer.',
    pointsCost: 25,
    partner: 'EcoScan demo partner', terms: 'Demo only. One per browser session. Use within 30 days. Unused vouchers can be refunded. No cash or real products.', expiresAt: '2027-12-31T23:59:59.000Z',
  },
  {
    id: 'swap-pass',
    title: 'Clothing swap pass',
    description: 'A sample pass for a community clothing swap.',
    pointsCost: 60,
    partner: 'EcoScan demo partner', terms: 'Demo only. One per browser session. Use within 30 days. Unused vouchers can be refunded. No real event admission.', expiresAt: '2027-12-31T23:59:59.000Z',
  },
  {
    id: 'secondhand-voucher',
    title: 'Secondhand shop voucher',
    description: 'A sample offer for choosing pre-owned clothing.',
    pointsCost: 100,
    partner: 'EcoScan demo partner', terms: 'Demo only. One per browser session. Use within 30 days. Unused vouchers can be refunded. No real shop discount.', expiresAt: '2027-12-31T23:59:59.000Z',
  },
]
