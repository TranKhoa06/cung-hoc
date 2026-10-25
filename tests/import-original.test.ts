import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseImportPackage } from '../src/lib/parser';

const filename = new URL('../private-data/fpga-review-pt2.json', import.meta.url);
describe.skipIf(!existsSync(filename))('gói 125 câu riêng của người dùng', () => {
  it('giữ đủ song ngữ, khóa đáp án và ba cảnh báo nguồn mà không xuất bản tự động', () => {
    const raw = JSON.parse(readFileSync(filename, 'utf8'));
    const imported = parseImportPackage(raw);
    expect(imported.questions).toHaveLength(125);
    expect(imported.questions.filter(q => q.warning.includes('Đáp án dự kiến'))).toHaveLength(3);
    expect(imported.questions.every(q => q.prompt && q.promptEn && q.correctIds.length === 1)).toBe(true);
    expect(imported.questions.every(q => q.status === 'draft' && !q.reviewed)).toBe(true);
    expect(imported.questions.every(q => q.sourceReference?.includes('PDF trang'))).toBe(true);
  });
});
