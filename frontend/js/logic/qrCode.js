import { qrcode } from '../../node_modules/qrcode-generator/dist/qrcode.mjs';

export function makeQrDataUrl(value, cellSize = 5) {
  const code = qrcode(0, 'M');
  code.addData(String(value), 'Byte');
  code.make();
  return code.createDataURL(cellSize, 4);
}
