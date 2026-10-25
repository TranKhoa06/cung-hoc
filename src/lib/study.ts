import type { Attempt, CardReview, Question, Rating } from '../model';
import { sameSet } from './utils';
export function gradeAnswer(question: Pick<Question, 'correctIds' | 'kind'>, selected: string[]) {
  return question.kind !== 'unknown' && question.correctIds.length > 0 && sameSet(selected, question.correctIds);
}
export function scheduleReview(previous: CardReview | undefined, rating: Rating, date = new Date()) {
  const previousDays = previous?.intervalDays ?? 0;
  const days = rating === 'again' ? 0 : rating === 'hard' ? Math.max(1, Math.round(previousDays * 1.2)) : rating === 'good' ? Math.max(1, Math.round(previousDays * 2.5)) : Math.max(4, Math.round(previousDays * 3.5));
  return { dueAt: new Date(date.getTime() + (rating === 'again' ? 10 * 60 * 1000 : days * 86400000)).toISOString(), intervalDays: days, repetitions: rating === 'again' ? 0 : (previous?.repetitions ?? 0) + 1, lastRating: rating, reviewedAt: date.toISOString() };
}
export function firstAttempts(attempts: Attempt[]) {
  const first = new Map<string, Attempt>();
  for (const attempt of [...attempts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))) {
    const key = `${attempt.userId}:${attempt.questionId}:${attempt.version}`;
    if (!first.has(key)) first.set(key, attempt);
  }
  return [...first.values()];
}
export function validatePublished(question: Question): string[] {
  const errors: string[] = [];
  if (!question.prompt.trim()) errors.push('Thiếu nội dung câu hỏi.');
  if (question.choices.length < 2 || question.choices.some(choice => !choice.text.trim())) errors.push('Cần ít nhất hai lựa chọn có nội dung.');
  if (new Set(question.choices.map(choice => choice.id)).size !== question.choices.length) errors.push('ID lựa chọn bị trùng.');
  if (question.kind === 'unknown') errors.push('Chưa xác nhận câu chọn một hay chọn nhiều.');
  if (!question.correctIds.length || question.correctIds.some(id => !question.choices.some(choice => choice.id === id))) errors.push('Đáp án chưa hợp lệ.');
  if (new Set(question.correctIds).size !== question.correctIds.length) errors.push('Đáp án bị trùng.');
  if (question.kind === 'single' && question.correctIds.length !== 1) errors.push('Câu chọn một cần đúng một đáp án.');
  if (!question.reviewed) errors.push('Bạn cần xác nhận đã duyệt nội dung.');
  return errors;
}
