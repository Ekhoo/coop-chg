import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatPrice, formatDateTime } from './format'
import { formatGrams } from './database.types'

export interface SalesReportInput {
  from: Date
  to: Date
  clientTotal: number
  commissionTotal: number
  costTotal: number
  foyerMargin: number
  txCount: number
  byProduct: {
    product_name: string
    /** Si non null, l'article est vendu au poids ; qty = nombre de portions. */
    portion_grams: number | null
    qty: number
    client_cents: number
    foyer_cents: number
    commission_cents: number
    cost_cents: number
    margin_cents: number
  }[]
  bySeller: { seller_name: string; qty: number; client_cents: number }[]
  transactions: {
    created_at: string
    seller_name: string
    items_count: number
    total_cents: number
  }[]
}

const HEADER_FILL: [number, number, number] = [220, 38, 38]
const RIGHT = { halign: 'right' as const }

function getFinalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
}

export function generateSalesPdf(input: SalesReportInput) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const fromStr = input.from.toLocaleDateString('fr-FR')
  const toStr = input.to.toLocaleDateString('fr-FR')

  // ============ Header ============
  doc.setFontSize(18)
  doc.setTextColor(15, 23, 42)
  doc.text('Coopérative CHG — Rapport de ventes', 14, 18)

  doc.setFontSize(10)
  doc.setTextColor(120, 120, 120)
  doc.text('Caserne de Château-Gombert', 14, 25)

  doc.setFontSize(11)
  doc.setTextColor(60, 60, 60)
  doc.text(`Période : du ${fromStr} au ${toStr}`, 14, 33)

  doc.setTextColor(0)

  const ticketAvg = input.txCount > 0 ? input.clientTotal / input.txCount : 0

  // ============ Récap (table sans bordures) ============
  autoTable(doc, {
    startY: 40,
    theme: 'plain',
    styles: { fontSize: 11, cellPadding: 1.5 },
    body: [
      ['Total payé par les clients', formatPrice(input.clientTotal)],
      ['    · Foyer (vente - achat)', formatPrice(input.foyerMargin)],
      ['    · Caisse noire (pompiers)', formatPrice(input.commissionTotal)],
      ["Coût d'achat des articles vendus", formatPrice(input.costTotal)],
      ['Nombre de transactions', String(input.txCount)],
      ['Ticket moyen', formatPrice(Math.round(ticketAvg))],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 105 },
      1: { halign: 'right', cellWidth: 50 },
    },
  })

  let y = getFinalY(doc) + 10

  // ============ Ventilation par article ============
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('Ventilation par article', 14, y)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: y + 3,
    head: [
      [
        'Article',
        { content: 'Qté', styles: RIGHT },
        { content: 'Client', styles: RIGHT },
        { content: 'Foyer', styles: RIGHT },
        { content: 'Caisse noire', styles: RIGHT },
        { content: 'Coût', styles: RIGHT },
      ],
    ],
    body: input.byProduct.map((r) => [
      r.product_name,
      r.portion_grams != null
        ? `${r.qty} portions (${formatGrams(r.portion_grams * r.qty)})`
        : String(r.qty),
      formatPrice(r.client_cents),
      formatPrice(r.margin_cents),
      formatPrice(r.commission_cents),
      formatPrice(r.cost_cents),
    ]),
    headStyles: { fillColor: HEADER_FILL, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 'auto' },
      1: { halign: 'right', cellWidth: 32 },
      2: { halign: 'right', cellWidth: 28 },
      3: { halign: 'right', cellWidth: 28 },
      4: { halign: 'right', cellWidth: 28 },
      5: { halign: 'right', cellWidth: 28 },
    },
  })

  y = getFinalY(doc) + 10

  // ============ Par vendeur ============
  if (input.bySeller.length > 0) {
    doc.setFontSize(13)
    doc.setTextColor(15, 23, 42)
    doc.text('Par vendeur', 14, y)
    doc.setTextColor(0)

    autoTable(doc, {
      startY: y + 3,
      head: [
        [
          'Vendeur',
          { content: 'Articles vendus', styles: RIGHT },
          { content: 'Total client', styles: RIGHT },
        ],
      ],
      body: input.bySeller.map((r) => [
        r.seller_name,
        String(r.qty),
        formatPrice(r.client_cents),
      ]),
      headStyles: { fillColor: HEADER_FILL, textColor: 255, fontStyle: 'bold' },
      styles: { fontSize: 10, cellPadding: 2 },
      columnStyles: {
        0: { cellWidth: 'auto' },
        1: { halign: 'right', cellWidth: 40 },
        2: { halign: 'right', cellWidth: 40 },
      },
    })
    y = getFinalY(doc) + 10
  }

  // ============ Transactions ============
  doc.setFontSize(13)
  doc.setTextColor(15, 23, 42)
  doc.text('Transactions', 14, y)
  doc.setTextColor(0)

  autoTable(doc, {
    startY: y + 3,
    head: [
      [
        'Date',
        'Vendeur',
        { content: 'Articles', styles: RIGHT },
        { content: 'Total', styles: RIGHT },
      ],
    ],
    body: input.transactions.map((t) => [
      formatDateTime(t.created_at),
      t.seller_name,
      String(t.items_count),
      formatPrice(t.total_cents),
    ]),
    headStyles: { fillColor: HEADER_FILL, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 35 },
      1: { cellWidth: 'auto' },
      2: { halign: 'right', cellWidth: 25 },
      3: { halign: 'right', cellWidth: 28 },
    },
  })

  const filename = `cooperative-chg-ventes_${fromStr.replaceAll('/', '-')}_${toStr.replaceAll('/', '-')}.pdf`
  doc.save(filename)
}
