export interface OcrProgress { status: string; progress: number; }
let sessionActive = false;
export async function createOcrSession(onProgress: (progress: OcrProgress) => void) {
  if (sessionActive) throw new Error('Một phiên OCR trước vẫn đang kết thúc. Hãy chờ ảnh đó được lưu rồi thử lại.');
  sessionActive = true;
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng+vie', 1, { logger: event => onProgress({ status: event.status, progress: event.progress || 0 }) });
    let closed = false;
    return {
      recognize: async (blob: Blob) => { if (closed) throw new Error('Phiên OCR đã đóng.'); return (await worker.recognize(blob)).data.text; },
      close: async () => { if (closed) return; closed = true; try { await worker.terminate(); } finally { sessionActive = false; } },
    };
  } catch (error) { sessionActive = false; throw error; }
}

export async function transformImage(blob: Blob, rotation: number, crop?: { x: number; y: number; width: number; height: number }): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  const area = crop || { x: 0, y: 0, width: bitmap.width, height: bitmap.height };
  const angle = ((rotation % 4) + 4) % 4;
  const canvas = document.createElement('canvas');
  canvas.width = angle % 2 ? area.height : area.width;
  canvas.height = angle % 2 ? area.width : area.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Trình duyệt không tạo được vùng xử lý ảnh.');
  context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2); context.rotate(angle * Math.PI / 2);
  context.drawImage(bitmap, area.x, area.y, area.width, area.height, -area.width / 2, -area.height / 2, area.width, area.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('Không xuất được ảnh.')), 'image/jpeg', .94));
}
