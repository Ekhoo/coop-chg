import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatPrice, formatDateTime } from './format'

export interface SalesReportInput {
  from: Date
  to: Date
  totalCents: number
  txCount: number
  byProduct: { product_name: string; qty: number; revenue_cents: number }[]
  bySeller: { seller_name: string; qty: number; revenue_cents: number }[]
  transactions: {
    created_at: string
    seller_name: string
    items_count: number
    total_cents: number
  }[]
}

export function generateSalesPdf(input: SalesReportInput) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const fromStr = input.from.toLocaleDateString('fr-FR')
  const toStr = input.to.toLocaleDateString('fr-FR')

  doc.setFontSize(18)
  doc.text('Coop Nico — Rapport de ventes', 14, 18)
  doc.setFontSize(11)
  doc.setTextColor(100)
  doc.text(`Période : ${fromStr} → ${toStr}`, 14, 26)
  doc.setTextColor(0)

  doc.setFontSize(12)
  const ticketAvg = input.txCount > 0 ? input.totalCents / input.txCount : 0
  autoTable(doc, {
    startY: 32,
    theme: 'plain',
    styles: { fontSize: 11, cellPadding: 1.5 },
    body: [
      ['Total des ventes', formatPrice(input.totalCents)],
      ['Nombre de transactions', String(input.txCount)],
      ['Ticket moyen', formatPrice(Math.round(ticketAvg))],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 60 } },
  })

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  doc.setFontSize(13)
  doc.text('Ventes par article', 14, y)
  autoTable(doc, {
    startY: y + 3,
    head: [['Article', 'Quantité', 'CA']],
    body: input.byProduct.map((r) => [
      r.product_name,
      String(r.qty),
      formatPrice(r.revenue_cents),
    ]),
    headStyles: { fillColor: [220, 38, 38] },
    columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  if (input.bySeller.length > 0) {
    doc.setFontSize(13)
    doc.text('Ventes par vendeur', 14, y)
    autoTable(doc, {
      startY: y + 3,
      head: [['Vendeur', 'Articles vendus', 'CA']],
      body: input.bySeller.map((r) => [
        r.seller_name,
        String(r.qty),
        formatPrice(r.revenue_cents),
      ]),
      headStyles: { fillColor: [220, 38, 38] },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  }

  doc.setFontSize(13)
  doc.text('Transactions', 14, y)
  autoTable(doc, {
    startY: y + 3,
    head: [['Date', 'Vendeur', 'Articles', 'Total']],
    body: input.transactions.map((t) => [
      formatDateTime(t.created_at),
      t.seller_name,
      String(t.items_count),
      formatPrice(t.total_cents),
    ]),
    headStyles: { fillColor: [220, 38, 38] },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
  })

  const filename = `coop-nico-ventes_${fromStr.replaceAll('/', '-')}_${toStr.replaceAll('/', '-')}.pdf`
  doc.save(filename)
}
