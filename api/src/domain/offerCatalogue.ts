export interface DemoOffer {
  id: string
  title: string
  description: string
  pointsCost: number
}

// These are product-demo examples. Redeeming one does not issue a real voucher.
export const DEMO_OFFERS: readonly DemoOffer[] = [
  {
    id: 'repair-kit',
    title: 'Clothing repair kit',
    description: 'A sample reward for keeping clothes in use longer.',
    pointsCost: 25,
  },
  {
    id: 'swap-pass',
    title: 'Clothing swap pass',
    description: 'A sample pass for a community clothing swap.',
    pointsCost: 60,
  },
  {
    id: 'secondhand-voucher',
    title: 'Secondhand shop voucher',
    description: 'A sample offer for choosing pre-owned clothing.',
    pointsCost: 100,
  },
]
