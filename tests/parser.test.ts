import { describe, expect, it } from 'vitest';
import { emptyQuestion, parseQuestions, revisedQuestion, validateForPublish, parseImportPackage } from '../src/lib/parser';
describe('OCR question parser', () => {
  it('keeps six choices, multiple questions, formulas and unknown answers', () => {
    const questions = parseQuestions('Câu 1: Chọn giá trị x_1?\nA. Một\nB. Hai\nC. Ba\nD. Bốn\nE. Năm\nF. Sáu\nCâu 2: Chọn tiếp?\nA. Có\nB. Không', 'deck', 'image');
    expect(questions).toHaveLength(2); expect(questions[0].choices).toHaveLength(6);
    expect(questions[0].prompt).toContain('x_1'); expect(questions[0].correctIds).toEqual([]);
    expect(questions[0].kind).toBe('unknown'); expect(questions[0].sourceIds).toEqual(['image']);
  });
  it('keeps numeric choices within explicitly numbered questions', () => {
    const [question] = parseQuestions('Question 9: Choose\n1) one\n2) two\n3) three', 'deck');
    expect(question.number).toBe(9); expect(question.choices.map(choice => choice.label)).toEqual(['1', '2', '3']);
  });
  it('does not turn an unsupported fragment into a published question or invent A', () => {
    const [question] = parseQuestions('Một dòng không rõ công thức z_2', 'deck');
    expect(question.correctIds).toEqual([]); expect(question.status).toBe('draft');
    expect(validateForPublish(question).length).toBeGreaterThan(0);
  });
  it('keeps a printed answer note as an unverified opinion, not part of the last choice', () => {
    const [question] = parseQuestions('Câu 3: Chọn?\nA. Có\nB. Không\nĐáp án: B\nVì một lý do chưa xác minh', 'deck', 'source');
    expect(question.choices[1].text).toBe('Không'); expect(question.correctIds).toEqual([]);
    expect(question.opinions).toHaveLength(1); expect(question.opinions[0].answerIds).toEqual([question.choices[1].id]);
    expect(question.opinions[0].explanation).toContain('chưa xác minh');
  });
  it('requires explicit review and exact valid correct IDs for publication', () => {
    const q = emptyQuestion('deck'); q.prompt = 'Đề'; q.choices.forEach(choice => choice.text = choice.label); q.kind = 'single'; q.correctIds = [q.choices[0].id];
    expect(validateForPublish(q)).toContain('Bạn cần xác nhận đã kiểm tra nội dung.');
    q.reviewed = true; expect(validateForPublish(q)).toEqual([]);
    q.correctIds.push(q.choices[1].id); expect(validateForPublish(q).length).toBeGreaterThan(0);
    q.kind = 'multiple'; expect(validateForPublish(q)).toEqual([]);
  });
  it('only increments content versions for actual input changes', () => {
    const q = emptyQuestion('deck');
    expect(revisedQuestion(q, { ...q, reviewed: true }).version).toBe(1);
    expect(revisedQuestion(q, { ...q, prompt: 'Changed' }).version).toBe(2);
  });
  it('rejects foreign formats and dangling decks in imports', () => {
    expect(() => parseImportPackage({ format: 'other', version: 1, decks: [], questions: [] })).toThrow();
    expect(() => parseImportPackage({ format: 'cung-hoc', version: 1, decks: [], questions: [{ id: crypto.randomUUID(), deckId: crypto.randomUUID(), prompt: 'X', choices: [] }] })).toThrow();
  });
});
