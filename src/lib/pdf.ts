import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { formatPrice, formatDateTime } from './format'

export interface SalesReportInput {
  from: Date
  to: Date
  clientTotal: number
  caserneTotal: number
  commissionTotal: number
  costTotal: number
  caserneMargin: number
  txCount: number
  byProduct: {
    product_name: string
    qty: number
    client_cents: number
    caserne_cents: number
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

export function generateSalesPdf(input: SalesReportInput) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
  const fromStr = input.from.toLocaleDateString('fr-FR')
  const toStr = input.to.toLocaleDateString('fr-FR')

  doc.setFontSize(18)
  doc.text('Coopérative CHG — Rapport de ventes', 14, 18)
  doc.setFontSize(10)
  doc.setTextColor(120)
  doc.text('Caserne de Château-Gombert', 14, 24)
  doc.setFontSize(11)
  doc.text(`Période : ${fromStr} → ${toStr}`, 14, 31)
  doc.setTextColor(0)

  const ticketAvg = input.txCount > 0 ? input.clientTotal / input.txCount : 0

  autoTable(doc, {
    startY: 37,
    theme: 'plain',
    styles: { fontSize: 11, cellPadding: 1.5 },
    body: [
      ['Total payé par les clients', formatPrice(input.clientTotal)],
      ['  → Part caserne', formatPrice(input.caserneTotal)],
      ['  → Caisse noire (pompiers)', formatPrice(input.commissionTotal)],
      ["Coût d'achat des articles vendus", formatPrice(input.costTotal)],
      ['Marge caserne (vente − achat)', formatPrice(input.caserneMargin)],
      ['Nombre de transactions', String(input.txCount)],
      ['Ticket moyen', formatPrice(Math.round(ticketAvg))],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 80 } },
  })

  let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  doc.setFontSize(13)
  doc.text('Ventilation par article', 14, y)
  autoTable(doc, {
    startY: y + 3,
    head: [['Article', 'Qté', 'Client', 'Caserne', 'Caisse noire', 'Coût', 'Marge']],
    body: input.byProduct.map((r) => [
      r.product_name,
      String(r.qty),
      formatPrice(r.client_cents),
      formatPrice(r.caserne_cents),
      formatPrice(r.commission_cents),
      formatPrice(r.cost_cents),
      formatPrice(r.margin_cents),
    ]),
    headStyles: { fillColor: HEADER_FILL },
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
      4: { halign: 'right' },
      5: { halign: 'right' },
      6: { halign: 'right' },
    },
  })

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8

  if (input.bySeller.length > 0) {
    doc.setFontSize(13)
    doc.text('Par vendeur', 14, y)
    autoTable(doc, {
      startY: y + 3,
      head: [['Vendeur', 'Articles vendus', 'Total client']],
      body: input.bySeller.map((r) => [
        r.seller_name,
        String(r.qty),
        formatPrice(r.client_cents),
      ]),
      headStyles: { fillColor: HEADER_FILL },
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
    headStyles: { fillColor: HEADER_FILL },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
  })

  const filename = `cooperative-chg-ventes_${fromStr.replaceAll('/', '-')}_${toStr.replaceAll('/', '-')}.pdf`
  doc.save(filename)
}
