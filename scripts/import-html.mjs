import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
const [input, destination = 'private-data/fpga-review-pt2.json'] = process.argv.slice(2);
if (!input) { console.error('Cách dùng: npm run import:html -- <duong-dan-html> [tep-json-dich]'); process.exit(1); }
const html = await readFile(input, 'utf8');
const match = html.match(/<script\b(?=[^>]*\bid=["']question-bank["'])[^>]*>([\s\S]*?)<\/script>/i);
if (!match) throw new Error('Không tìm thấy JSON question-bank trong HTML. Không thực thi mã từ HTML.');
const original = JSON.parse(match[1]);
if (!Array.isArray(original) || original.length === 0) throw new Error('Ngân hàng câu hỏi không hợp lệ.');
const stableId = value => { const hex = createHash('sha256').update(value).digest('hex'); return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`; };
const plain = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
const paragraphs = value => (Array.isArray(value) ? value : [value]).map(plain).filter(Boolean).join('\n\n');
const createdAt = new Date().toISOString();
const deckId = stableId('fpga-review-pt2');
const questions = original.map(item => {
  if (!item.id || !Array.isArray(item.choicesVi)) throw new Error('Câu nguồn thiếu ID hoặc lựa chọn.');
  const choices = item.choicesVi.map(choice => ({ id: `option-${choice.letter}`, label: choice.letter, text: plain(choice.text), textEn: plain(item.choicesEn?.find(en => en.letter === choice.letter)?.text) }));
  const correctIds = choices.filter(c => c.label === item.correct).map(c => c.id);
  return { id: stableId(item.id), deckId, chapter: `Chương ${item.chapter}`, number: item.number, prompt: paragraphs(item.promptVi), promptEn: paragraphs(item.promptEn), choices, kind: 'single', correctIds, explanation: paragraphs(item.explanation), memory: plain(item.memory), warning: [plain(item.warning), item.expectedAnswerNote ? 'Đáp án dự kiến trong tài liệu nguồn — cần xác nhận lại.' : ''].filter(Boolean).join('\n'), sourceIds: [], questionImageIds: [], opinions: [], status: 'draft', reviewed: !item.expectedAnswerNote && correctIds.length === 1, version: 1, createdAt, sourceReference: `${item.id} · PDF trang ${item.sourcePdfPages?.join(', ') || item.sourceOriginalPage || '?'}` };
});
if (new Set(questions.map(q => q.id)).size !== questions.length) throw new Error('ID câu nguồn bị trùng.');
const payload = { format: 'cung-hoc', version: 1, decks: [{ id: deckId, title: 'FPGA · Review PT2', subject: 'FAP201 · FPGA', description: `${questions.length} câu song ngữ · Chương 7–11 · Nhập từ HTML bạn cung cấp.`, color: '#e3efde', status: 'draft', createdAt }], questions };
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(payload, null, 2), 'utf8');
console.log(`Đã chuyển ${questions.length} câu; ${questions.filter(q => !q.reviewed).length} câu cần kiểm tra lại. Tệp riêng: ${path.resolve(destination)}. Không đưa tệp này vào GitHub hoặc dist.`);
