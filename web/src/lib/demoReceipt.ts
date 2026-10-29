import { jsPDF } from 'jspdf'
import type { OffersResponse } from 'shared'

export type RedeemedOffer = OffersResponse['offers'][number] & {
  receipt: NonNullable<OffersResponse['offers'][number]['receipt']>
}

export function buildDemoReceiptPdf(offer: RedeemedOffer): jsPDF {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  const redeemedAt = new Date(offer.receipt.redeemedAt).toLocaleString('en-IN', {
    dateStyle: 'medium', timeStyle: 'short',
  })

  pdf.setProperties({ title: `EcoScan sample redemption - ${offer.receipt.reference}` })
  pdf.setFillColor(246, 247, 239)
  pdf.rect(0, 0, 210, 297, 'F')
  pdf.setTextColor(39, 72, 50)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(25)
  pdf.text('EcoScan', 22, 29)
  pdf.setDrawColor(188, 203, 173)
  pdf.line(22, 37, 188, 37)

  pdf.setFontSize(19)
  pdf.text('Sample redemption record', 22, 57)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)
  pdf.setTextColor(72, 82, 73)
  pdf.text('For demonstration only. This is not a voucher or proof of purchase.', 22, 67)

  pdf.setFillColor(233, 240, 224)
  pdf.roundedRect(22, 82, 166, 75, 4, 4, 'F')
  pdf.setTextColor(39, 72, 50)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(15)
  pdf.text(offer.title, 30, 98)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(11)
  pdf.text(`Points used: ${offer.pointsCost}`, 30, 113)
  pdf.text(`Redeemed: ${redeemedAt}`, 30, 127)
  pdf.text(`Reference: ${offer.receipt.reference}`, 30, 141)

  pdf.setTextColor(72, 82, 73)
  pdf.setFontSize(10)
  pdf.text('No product, pass, discount, or partner benefit is issued by this demo.', 22, 178)
  pdf.text('The points and offers shown in EcoScan are illustrative.', 22, 186)
  return pdf
}

export function downloadDemoReceipt(offer: RedeemedOffer): void {
  buildDemoReceiptPdf(offer).save(`ecoscan-sample-${offer.receipt.reference}.pdf`)
}
