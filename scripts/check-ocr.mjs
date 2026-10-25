import { createWorker } from 'tesseract.js';
import path from 'node:path';
const [languageDirectory, imageFile = 'tests/fixtures/ocr-sample.png'] = process.argv.slice(2);
if (!languageDirectory) throw new Error('Cần đường dẫn thư mục eng.traineddata và vie.traineddata để kiểm tra offline.');
const worker = await createWorker('eng+vie', 1, { langPath: path.resolve(languageDirectory), gzip: false, cacheMethod: 'none' });
try {
  const { data } = await worker.recognize(path.resolve(imageFile));
  const text = data.text;
  if (!text.includes('100 MHz') || !text.includes('200 MHz') || !/Câu\s*2/i.test(text)) throw new Error('OCR chưa đọc đủ các nội dung kiểm tra từ ảnh mẫu.');
  console.log('OCR Việt–Anh đọc ảnh mẫu thành công, giữ lựa chọn E và tách được tiêu đề Câu 2.');
  console.log(text);
} finally { await worker.terminate(); }
