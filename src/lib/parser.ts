import type { Choice, Deck, Question } from '../model';
import { now, uid } from './utils';

export function emptyQuestion(deckId: string, number = 1): Question {
  return { id: uid(), deckId, chapter: '', number, prompt: '', choices: [{ id: uid(), label: 'A', text: '' }, { id: uid(), label: 'B', text: '' }], kind: 'unknown', correctIds: [], explanation: '', memory: '', warning: '', sourceIds: [], questionImageIds: [], opinions: [], status: 'draft', reviewed: false, version: 1, createdAt: now() };
}

/** OCR text is evidence, never an authoritative key. All extracted questions need review. */
export function parseQuestions(text: string, deckId: string, sourceId?: string, startNumber = 1): Question[] {
  const blocks: { number: number; lines: string[] }[] = [];
  let block: { number: number; lines: string[] } | null = null;
  let explicitHeaders = /(?:^|\n)\s*(?:câu|question|q)\s*\d+/i.test(text);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const header = line.match(/^(?:câu|question|q)\s*(\d+)\s*[.):\-]?\s*(.*)$/i);
    const numbered = !explicitHeaders ? line.match(/^(\d+)[.)]\s+(.+)$/) : null;
    const hasLetterOptions = block?.lines.some(value => /^[([]?[A-Z][).:\]]\s*/.test(value));
    if (header || (numbered && (!block || hasLetterOptions))) {
      if (block) blocks.push(block);
      const match = header || numbered!;
      block = { number: Number(match[1]), lines: match[2] ? [match[2]] : [] };
    } else {
      if (!block) block = { number: startNumber, lines: [] };
      block.lines.push(line);
    }
  }
  if (block) blocks.push(block);
  return blocks.filter(value => value.lines.length).map((value, index) => {
    const question = emptyQuestion(deckId, value.number || startNumber + index);
    const prompt: string[] = [];
    const choices: Choice[] = [];
    const answerNotes: string[] = [];
    let inAnswerNote = false;
    let last: Choice | null = null;
    for (const original of value.lines) {
      if (/^(?:đáp\s*án|answer(?:\s*key)?|correct\s*answer)\s*[:：\-]/i.test(original)) inAnswerNote = true;
      if (inAnswerNote) { answerNotes.push(original); continue; }
      // Recognize several options on one line without splitting arbitrary ordinary text.
      const markers = [...original.matchAll(/(?:^|\s{2,})(\(?[A-Z][).:\]])\s+/g)];
      const sublines = markers.length >= 2 ? markers.map((match, i) => original.slice(match.index! + (match[0].length - match[0].trimStart().length), markers[i + 1]?.index).trim()) : [original];
      for (const line of sublines) {
        const option = line.match(/^[(\[]?([A-Z]|\d{1,2})[).:\]]\s*(.*)$/);
        if (option) {
          last = { id: uid(), label: option[1], text: option[2] };
          choices.push(last);
        } else if (last) last.text += '\n' + line;
        else prompt.push(line);
      }
    }
    question.prompt = prompt.join('\n');
    question.choices = choices;
    question.sourceIds = sourceId ? [sourceId] : [];
    if (answerNotes.length) {
      const suggestedLabels: string[] = answerNotes[0].replace(/^[^:：\-]*[:：\-]/, '').match(/\b[A-Z]\b|\b\d{1,2}\b/g) || [];
      question.opinions = [{ id: uid(), text: answerNotes.join('\n'), answerIds: choices.filter(choice => suggestedLabels.includes(choice.label)).map(choice => choice.id), explanation: answerNotes.slice(1).join('\n'), ...(sourceId ? { sourceId } : {}) }];
    }
    question.warning = [!question.prompt ? 'Chưa nhận ra phần đề.' : '', choices.length < 2 ? 'Chưa nhận ra đủ lựa chọn; hãy đối chiếu ảnh.' : '', new Set(choices.map(choice => choice.label)).size !== choices.length ? 'Nhãn lựa chọn bị trùng; cần kiểm tra.' : '', 'Bản OCR chưa xác minh. Chọn loại câu và xác nhận đáp án trước khi xuất bản.'].filter(Boolean).join(' ');
    return question;
  });
}

export function validateForPublish(question: Question): string[] {
  const errors: string[] = [];
  if (!question.prompt.trim()) errors.push('Câu hỏi chưa có nội dung.');
  if (question.choices.length < 2 || question.choices.some(choice => !choice.text.trim())) errors.push('Cần ít nhất hai lựa chọn có nội dung đầy đủ.');
  if (new Set(question.choices.map(choice => choice.id)).size !== question.choices.length) errors.push('ID lựa chọn bị trùng.');
  if (new Set(question.choices.map(choice => choice.label.trim().toLocaleLowerCase())).size !== question.choices.length || question.choices.some(choice => !choice.label.trim())) errors.push('Nhãn lựa chọn phải đầy đủ và không trùng.');
  if (question.kind === 'unknown') errors.push('Chọn loại một đáp án hoặc nhiều đáp án.');
  if (!question.correctIds.length || question.correctIds.some(id => !question.choices.some(choice => choice.id === id))) errors.push('Đáp án đúng chưa hợp lệ.');
  if (new Set(question.correctIds).size !== question.correctIds.length) errors.push('Đáp án đúng bị trùng.');
  if (question.kind === 'single' && question.correctIds.length !== 1) errors.push('Câu một đáp án phải có đúng một lựa chọn đúng.');
  if (!question.reviewed) errors.push('Bạn cần xác nhận đã kiểm tra nội dung.');
  return errors;
}

export function revisedQuestion(original: Question, edited: Question): Question {
  const input = (question: Question) => JSON.stringify({ ...question, status: undefined, reviewed: undefined, version: undefined, aiCheck: undefined });
  const changed = input(original) !== input(edited);
  return { ...edited, version: changed ? original.version + 1 : original.version, aiCheck: original.aiCheck };
}

export function parseImportPackage(value: unknown): { decks: Deck[]; questions: Question[] } {
  if (!value || typeof value !== 'object') throw new Error('Tệp phải là một gói JSON Cùng học.');
  const data = value as Record<string, unknown>;
  if (data.format !== 'cung-hoc' || data.version !== 1 || !Array.isArray(data.decks) || !Array.isArray(data.questions)) throw new Error('Gói không đúng định dạng cung-hoc, phiên bản 1.');
  if (data.decks.length > 500 || data.questions.length > 20000) throw new Error('Gói quá lớn. Hãy chia thành các bộ nhỏ.');
  const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const decks: Deck[] = data.decks.map(item => {
    if (!item || typeof item !== 'object' || !uuidPattern.test(item.id) || typeof item.title !== 'string') throw new Error('Bộ học thiếu ID hoặc tiêu đề hợp lệ.');
    return { id: item.id, title: item.title, subject: String(item.subject || ''), description: String(item.description || ''), color: String(item.color || '#137347'), status: 'draft', createdAt: typeof item.createdAt === 'string' ? item.createdAt : now() };
  });
  if (new Set(decks.map(deck => deck.id)).size !== decks.length) throw new Error('ID bộ học bị trùng.');
  const deckIds = new Set(decks.map(deck => deck.id));
  const questions: Question[] = data.questions.map(item => {
    if (!item || typeof item !== 'object' || !uuidPattern.test(item.id) || !deckIds.has(item.deckId) || typeof item.prompt !== 'string' || !Array.isArray(item.choices) || item.choices.length > 100) throw new Error('Một câu hỏi thiếu dữ liệu hoặc không thuộc bộ trong gói.');
    const choices = item.choices.map((choice: unknown) => {
      const c = choice as Choice;
      if (!c || typeof c.id !== 'string' || typeof c.text !== 'string' || typeof c.label !== 'string') throw new Error('Lựa chọn trong gói không hợp lệ.');
      return { id: c.id, label: c.label, text: c.text, ...(typeof c.textEn === 'string' ? { textEn: c.textEn } : {}) };
    });
    if (new Set(choices.map((choice: Choice) => choice.id)).size !== choices.length) throw new Error('ID lựa chọn bị trùng trong một câu.');
    const correctIds = Array.isArray(item.correctIds) ? item.correctIds.filter((id: unknown) => typeof id === 'string' && choices.some((choice: Choice) => choice.id === id)) : [];
    const opinions = Array.isArray(item.opinions) ? item.opinions.filter((opinion: unknown) => opinion && typeof opinion === 'object').map((opinion: Record<string, unknown>) => ({ id: typeof opinion.id === 'string' ? opinion.id : uid(), text: String(opinion.text || ''), explanation: String(opinion.explanation || ''), answerIds: Array.isArray(opinion.answerIds) ? opinion.answerIds.filter((id: unknown) => typeof id === 'string' && choices.some((choice: Choice) => choice.id === id)) : [] })) : [];
    return { ...emptyQuestion(item.deckId, Number(item.number) || 1), id: item.id, chapter: String(item.chapter || ''), prompt: item.prompt, ...(typeof item.promptEn === 'string' ? { promptEn: item.promptEn } : {}), ...(typeof item.sourceReference === 'string' ? { sourceReference: item.sourceReference } : {}), choices, correctIds, kind: ['single', 'multiple'].includes(item.kind) ? item.kind : 'unknown', explanation: String(item.explanation || ''), memory: String(item.memory || ''), warning: String(item.warning || ''), opinions, status: 'draft', reviewed: false, version: Math.max(1, Number(item.version) || 1) } as Question;
  });
  if (new Set(questions.map(question => question.id)).size !== questions.length) throw new Error('ID câu hỏi bị trùng.');
  return { decks, questions };
}
