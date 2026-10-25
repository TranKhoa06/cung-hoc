import { describe, expect, it } from 'vitest';
import { firstAttempts, gradeAnswer, scheduleReview, validatePublished } from '../src/lib/study';
import { createDemoData } from '../src/lib/demo';
import type { Attempt, CardReview } from '../src/model';
describe('chấm trắc nghiệm nhiều lựa chọn', () => {
  it('chọn nhiều cần đủ và không thừa, thứ tự không quan trọng', () => { const q = { kind: 'multiple' as const, correctIds: ['a', 'c', 'e'] }; expect(gradeAnswer(q, ['e', 'a', 'c'])).toBe(true); expect(gradeAnswer(q, ['a', 'c'])).toBe(false); expect(gradeAnswer(q, ['a', 'b', 'c', 'e'])).toBe(false); expect(gradeAnswer(q, ['a', 'a', 'c'])).toBe(false); });
  it('chưa xác định loại hoặc chưa có đáp án không được chấm đúng', () => { expect(gradeAnswer({ kind: 'unknown', correctIds: ['a'] }, ['a'])).toBe(false); expect(gradeAnswer({ kind: 'single', correctIds: [] }, [])).toBe(false); });
  it('không cho xuất bản câu chưa duyệt hoặc có ID đáp án lạ', () => { const q = createDemoData().questions[0]; expect(validatePublished(q)).toEqual([]); expect(validatePublished({ ...q, reviewed: false })).not.toEqual([]); expect(validatePublished({ ...q, correctIds: ['missing'] })).not.toEqual([]); });
});
describe('tiến trình không ghi đè lần đầu', () => {
  it('giữ lần đầu theo người và phiên bản câu', () => { const make = (id: string, correct: boolean, version: number, createdAt: string): Attempt => ({ id, correct, version, createdAt, userId: 'u', questionId: 'q', selectedIds: ['a'] }); const a = make('1', false, 1, '2026-10-25T01:00:00Z'); const b = make('2', true, 1, '2026-10-25T02:00:00Z'); const c = make('3', true, 2, '2026-10-25T03:00:00Z'); expect(firstAttempts([b, c, a]).map(x => x.id)).toEqual(['1', '3']); });
});
describe('lịch ôn', () => {
  const date = new Date('2026-10-25T00:00:00Z');
  it('quên hẹn sau mười phút, dễ hẹn sau bốn ngày cho thẻ mới', () => { expect(scheduleReview(undefined, 'again', date).dueAt).toBe('2026-10-25T00:10:00.000Z'); expect(scheduleReview(undefined, 'easy', date).intervalDays).toBe(4); });
  it('ngày ôn tăng theo lần nhớ, quên đặt lại lần nhớ', () => { const prior = { intervalDays: 4, repetitions: 2 } as CardReview; expect(scheduleReview(prior, 'good', date).intervalDays).toBe(10); expect(scheduleReview(prior, 'again', date).repetitions).toBe(0); });
});
