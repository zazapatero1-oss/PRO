import qrcode from 'qrcode-generator'

/** Renders `text` as a QR code SVG string (error-correction M, auto version). */
export function qrSvg(text: string, cellSize = 4): string {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  return qr.createSvgTag({ cellSize, margin: 2, scalable: true })
}
