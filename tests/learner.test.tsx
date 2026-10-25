// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import Quiz from '../src/features/study/Quiz';
import Flashcards from '../src/features/study/Flashcards';
import { createDemoData, demoProfile } from '../src/lib/demo';
import { gradeAnswer } from '../src/lib/study';
import type { Repository } from '../src/lib/contracts';
import type { AppData, Question, Rating } from '../src/model';

beforeAll(() => { URL.createObjectURL = vi.fn(() => 'blob:test-image'); URL.revokeObjectURL = vi.fn(); });
afterEach(cleanup);
function setup(onlyOne = false) {
  const records = createDemoData();
  if (onlyOne) records.questions = [records.questions[0]];
  const notify = vi.fn();
  const recordAttempt = vi.fn(async (q: Question, selectedIds: string[]) => {
    const result = { id: crypto.randomUUID(), userId: demoProfile.id, questionId: q.id, version: q.version, selectedIds, correct: gradeAnswer(q, selectedIds), createdAt: new Date().toISOString() };
    records.attempts.push(result); return result;
  });
  const reviewCard = vi.fn(async (_q: Question, _rating: Rating) => ({}));
  const repo = { mode: 'demo', recordAttempt, reviewCard, getSourceBlob: vi.fn(), logActivity: vi.fn(async () => {}), toggleBookmark: vi.fn(), reportQuestion: vi.fn() } as unknown as Repository;
  function Harness({ page }: { page: 'quiz' | 'flashcards' }) {
    const [data, setData] = useState<AppData>(structuredClone(records));
    const props = { data, repo, profile: demoProfile, notify, refresh: async () => setData(structuredClone(records)) };
    return page === 'quiz' ? <Quiz {...props}/> : <Flashcards {...props}/>;
  }
  return { records, recordAttempt, reviewCard, Harness };
}
describe('luồng người học', () => {
  it('chọn phương án chưa tạo lượt chấm; chỉ nút Kiểm tra mới lưu một lượt', async () => {
    const { Harness, recordAttempt } = setup(true);
    render(<Harness page="quiz"/>);
    fireEvent.click(screen.getByText('Để có thêm cơ hội truy hồi kiến thức.'));
    expect(recordAttempt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Kiểm tra đáp án/ }));
    await screen.findByText('Chính xác! Bạn đã hiểu câu này.');
    expect(recordAttempt).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Lời giải & ghi nhớ')).toBeTruthy();
  });
  it('câu nhiều đáp án cho phép chọn một tập đủ thay vì chấm ngay sau lựa chọn đầu', async () => {
    const { Harness, records, recordAttempt } = setup();
    records.questions = [records.questions[1]];
    render(<Harness page="quiz"/>);
    const choices = screen.getAllByRole('checkbox');
    expect(choices).toHaveLength(5);
    fireEvent.click(choices[0]); fireEvent.click(choices[1]); fireEvent.click(choices[3]);
    expect(recordAttempt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /Kiểm tra đáp án/ }));
    await screen.findByText('Chính xác! Bạn đã hiểu câu này.');
    expect(recordAttempt.mock.calls[0][1]).toHaveLength(3);
  });
  it('lọc chưa làm vẫn giữ lời giải câu vừa chấm cho tới khi người học bấm chuyển', async () => {
    const { Harness, records } = setup();
    records.questions = records.questions.slice(0, 2);
    render(<Harness page="quiz"/>);
    fireEvent.change(screen.getByLabelText('Câu hỏi'), { target: { value: 'unanswered' } });
    fireEvent.click(screen.getByText('Để có thêm cơ hội truy hồi kiến thức.'));
    fireEvent.click(screen.getByRole('button', { name: /Kiểm tra đáp án/ }));
    await screen.findByText('Chính xác! Bạn đã hiểu câu này.');
    expect(screen.getByText(records.questions[0].prompt)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Câu tiếp/ }));
    await screen.findByText(records.questions[1].prompt);
  });
  it('lật thẻ trước khi đánh giá và kết thúc phiên sau thẻ cuối, không lặp vô hạn', async () => {
    const { Harness, reviewCard } = setup(true);
    render(<Harness page="flashcards"/>);
    fireEvent.click(screen.getByRole('button', { name: /Bắt đầu ôn thẻ/ }));
    expect(screen.queryByRole('button', { name: /Nhớ\s*Trả lời được/ })).toBeNull();
    expect(screen.queryByText('Để có thêm cơ hội truy hồi kiến thức.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Hiện đáp án/ }));
    expect(screen.getByText('Để có thêm cơ hội truy hồi kiến thức.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Nhớ\s*Trả lời được/ }));
    await waitFor(() => expect(screen.getByText('Bạn đã hoàn thành phiên ôn!')).toBeTruthy());
    expect(reviewCard).toHaveBeenCalledTimes(1);
  });
});
