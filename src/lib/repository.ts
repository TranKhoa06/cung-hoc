import type { Repository } from './contracts';
import type { AppData, Profile, Deck, Question, SourceImage, Attempt, CardReview, Rating, Provider, AICheck, AIAvailability, Activity } from '../model';
import { readLocal, writeLocal } from './persistence';
import { createDemoData, demoProfile } from './demo';
import { uid, now } from './utils';
import { gradeAnswer, scheduleReview, validatePublished } from './study';
import { supabase } from './supabase';

const emptyData = (): AppData => ({ decks: [], questions: [], sources: [], attempts: [], reviews: [], bookmarks: [], profiles: [], reports: [], activities: [] });
function canonicalContent(value: unknown): string {
  const normalize = (item: any): any => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') return Object.fromEntries(Object.keys(item).sort().filter(key => !['status', 'reviewed', 'version', 'aiCheck'].includes(key)).map(key => [key, normalize(item[key])]));
    return item;
  };
  return JSON.stringify(normalize(value));
}
function validateQuestion(q: Question) {
  if (!q.id || !q.deckId || !Array.isArray(q.choices) || !Array.isArray(q.correctIds)) throw new Error('Dữ liệu câu hỏi không hợp lệ.');
  if (q.status === 'published') {
    const errors = validatePublished(q);
    if (errors.length) throw new Error(errors.join(' '));
  }
}
export async function createDemoRepository(): Promise<Repository> {
  const data = await readLocal<AppData>('demo:data') ?? createDemoData();
  const persist = () => writeLocal('demo:data', data);
  function replace<T extends { id: string }>(list: T[], row: T) { const index = list.findIndex(item => item.id === row.id); if (index >= 0) list[index] = structuredClone(row); else list.push(structuredClone(row)); }
  const repo: Repository = {
    mode: 'demo',
    async load() { return structuredClone(data); },
    async getProfile() { return demoProfile; },
    async saveDeck(deck) { replace(data.decks, deck); await persist(); },
    async saveQuestion(q) { validateQuestion(q); replace(data.questions, q); await persist(); },
    async saveQuestions(questions) { questions.forEach(validateQuestion); for (const q of questions) replace(data.questions, q); await persist(); },
    async saveSource(source, blob) { if (blob) await writeLocal(`blob:${source.id}`, blob); replace(data.sources, source); await persist(); },
    async getSourceBlob(source) { return await readLocal<Blob>(`blob:${source.id}`) ?? null; },
    async recordAttempt(question, selectedIds) {
      if (question.status !== 'published' || !selectedIds.length || selectedIds.some(id => !question.choices.some(c => c.id === id))) throw new Error('Lựa chọn không hợp lệ.');
      const attempt: Attempt = { id: uid(), userId: demoProfile.id, questionId: question.id, version: question.version, selectedIds, correct: gradeAnswer(question, selectedIds), createdAt: now() };
      data.attempts.push(attempt); await persist(); return attempt;
    },
    async reviewCard(question, rating) {
      const prior = data.reviews.find(r => r.questionId === question.id && r.version === question.version && r.userId === demoProfile.id);
      const review: CardReview = { id: prior?.id ?? uid(), userId: demoProfile.id, questionId: question.id, version: question.version, ...scheduleReview(prior, rating) };
      replace(data.reviews, review); await persist(); return review;
    },
    async toggleBookmark(questionId) { const index = data.bookmarks.findIndex(b => b.userId === demoProfile.id && b.questionId === questionId); if (index >= 0) data.bookmarks.splice(index, 1); else data.bookmarks.push({ userId: demoProfile.id, questionId }); await persist(); },
    async reportQuestion(questionId, message) { if (!message.trim()) throw new Error('Hãy nhập nội dung báo lỗi.'); data.reports.push({ id: uid(), userId: demoProfile.id, questionId, message: message.trim(), createdAt: now(), status: 'open' }); await persist(); },
    async updateMember(id, status) { if (id === demoProfile.id) throw new Error('Không thể khóa tài khoản quản trị đang sử dụng.'); const p = data.profiles.find(p => p.id === id); if (p) p.status = status; await persist(); },
    async inviteEmail() { throw new Error('Mời thành viên cần kết nối Supabase. Bản mẫu không gửi lời mời hoặc tạo tài khoản thật.'); },
    async logActivity(action, deckId) { data.activities.push({ id: uid(), userId: demoProfile.id, action, deckId, createdAt: now() }); await persist(); },
    async checkAI() { throw new Error('Bản mẫu chưa kết nối AI. Hãy kết nối Supabase và tự gán API key trong Edge Function Secrets để kiểm tra thật.'); },
    async aiStatus() { return { gemini: false, deepseek: false }; },
    async resolveReport(id) { const report = data.reports.find(r => r.id === id); if (report) report.status = 'resolved'; await persist(); },
    async signOut() { sessionStorage.removeItem('cung-hoc:demo'); },
  };
  await persist(); return repo;
}

type Row = Record<string, any>;
function asProfile(row: Row): Profile { return { id: row.id, email: row.email, name: row.name, role: row.role, status: row.status, createdAt: row.created_at, lastSeen: row.last_seen }; }
function asDeck(row: Row): Deck { return { id: row.id, title: row.title, subject: row.subject, description: row.description, color: row.color, status: row.status, createdAt: row.created_at }; }
function asQuestion(row: Row): Question { return { ...row.data, id: row.id, deckId: row.deck_id, chapter: row.chapter, number: row.number, status: row.status, version: row.version } as Question; }
function asAttempt(row: Row): Attempt { return { id: row.id, userId: row.user_id, questionId: row.question_id, version: row.version, selectedIds: row.selected_ids, correct: row.correct, createdAt: row.created_at }; }
function asReview(row: Row): CardReview { return { id: row.id, userId: row.user_id, questionId: row.question_id, version: row.version, dueAt: row.due_at, intervalDays: row.interval_days, repetitions: row.repetitions, lastRating: row.last_rating, reviewedAt: row.reviewed_at }; }
const questionRow = (q: Question) => ({ id: q.id, deck_id: q.deckId, chapter: q.chapter, number: q.number, status: q.status, version: q.version, data: q });
export function createCloudRepository(): Repository {
  const db = supabase;
  if (!db) throw new Error('Chưa kết nối Supabase.');
  async function currentUserId() { const { data, error } = await db!.auth.getUser(); if (error) throw error; if (!data.user) throw new Error('Phiên đăng nhập đã hết hạn.'); return data.user.id; }
  async function ensure<T>(promise: PromiseLike<{ data: T; error: unknown }>): Promise<T> { const result = await promise; if (result.error) throw result.error; return result.data; }
  async function allRows(table: string): Promise<Row[]> {
    const records: Row[] = [];
    const order = table === 'bookmarks' ? 'question_id' : 'id';
    for (let offset = 0; ; offset += 1000) {
      let query = db!.from(table).select('*').order(order);
      if (table === 'bookmarks') query = query.order('user_id');
      const page = await ensure(query.range(offset, offset + 999));
      records.push(...(page ?? []));
      if (!page || page.length < 1000) return records;
    }
  }
  const repo: Repository = {
    mode: 'cloud',
    async getProfile() { const id = await currentUserId(); const row = await ensure(db.from('profiles').select('*').eq('id', id).maybeSingle()); return row ? asProfile(row) : null; },
    async load() {
      const profile = await repo.getProfile();
      const tables = ['decks', 'questions', 'sources', 'attempts', 'card_reviews', 'bookmarks', 'profiles', 'reports', 'activities'] as const;
      const rows = await Promise.all(tables.map(async table => {
        if (table !== 'questions' || profile?.role === 'admin') return allRows(table);
        const records: Row[] = [];
        for (let offset = 0; ; offset += 1000) {
          const page = await ensure(db.rpc('get_learning_questions').range(offset, offset + 999));
          records.push(...(page ?? []));
          if (!page || page.length < 1000) return records;
        }
      }));
      return {
        ...emptyData(), decks: rows[0].map(asDeck), questions: rows[1].map(asQuestion), sources: rows[2].map(row => ({ ...row.data, id: row.id, deckId: row.deck_id, storagePath: row.storage_path } as SourceImage)),
        attempts: rows[3].map(asAttempt), reviews: rows[4].map(asReview), bookmarks: rows[5].map(row => ({ userId: row.user_id, questionId: row.question_id })), profiles: rows[6].map(asProfile),
        reports: rows[7].map(row => ({ id: row.id, userId: row.user_id, questionId: row.question_id, message: row.message, status: row.status, createdAt: row.created_at })),
        activities: rows[8].map(row => ({ id: row.id, userId: row.user_id, action: row.action, deckId: row.deck_id ?? undefined, createdAt: row.created_at })),
      };
    },
    async saveDeck(deck) { await ensure(db.from('decks').upsert({ id: deck.id, title: deck.title, subject: deck.subject, description: deck.description, color: deck.color, status: deck.status, created_at: deck.createdAt })); },
    async saveQuestion(question) {
      validateQuestion(question);
      const previous = await ensure(db.from('questions').select('version,data').eq('id', question.id).maybeSingle());
      if (previous) {
        if (question.version < previous.version) throw new Error('Câu hỏi đã được sửa ở nơi khác. Hãy tải lại trước khi lưu.');
        if (question.version === previous.version && canonicalContent(question) !== canonicalContent(previous.data)) throw new Error('Nội dung đã thay đổi hoặc bản sửa đã cũ. Hãy tải lại câu hỏi trước khi lưu.');
        const result = await ensure(db.from('questions').update(questionRow(question)).eq('id', question.id).eq('version', previous.version).select('id'));
        if (!result?.length) throw new Error('Phiên bản đã thay đổi. Hãy tải lại câu hỏi.');
      } else await ensure(db.from('questions').insert(questionRow(question)));
    },
    async saveQuestions(questions) { for (const question of questions) await repo.saveQuestion(question); },
    async saveSource(source, blob) {
      const safeName = source.name.replace(/[^\p{L}\p{N}._-]/gu, '_');
      const storagePath = source.storagePath ?? `${source.id}/${safeName}`;
      // Metadata first: storage policies authorize the object through this row.
      await ensure(db.from('sources').upsert({ id: source.id, deck_id: source.deckId, data: { ...source, storagePath }, storage_path: storagePath }));
      if (blob) await ensure(db.storage.from('source-images').upload(storagePath, blob, { upsert: true, contentType: blob.type || source.mime }));
    },
    async getSourceBlob(source) { if (!source.storagePath) return null; return await ensure(db.storage.from('source-images').download(source.storagePath)); },
    async recordAttempt(question, selectedIds) { const result = await ensure(db.rpc('submit_attempt', { p_question_id: question.id, p_selected_ids: selectedIds, p_version: question.version })); const row = Array.isArray(result) ? result[0] : result; if (!row) throw new Error('Không lưu được lượt trả lời.'); return asAttempt(row); },
    async reviewCard(question, rating) { const result = await ensure(db.rpc('review_card', { p_question_id: question.id, p_rating: rating, p_version: question.version })); const row = Array.isArray(result) ? result[0] : result; if (!row) throw new Error('Không lưu được lịch ôn.'); return asReview(row); },
    async toggleBookmark(questionId) { const userId = await currentUserId(); const previous = await ensure(db.from('bookmarks').select('question_id').eq('user_id', userId).eq('question_id', questionId).maybeSingle()); if (previous) await ensure(db.from('bookmarks').delete().eq('user_id', userId).eq('question_id', questionId)); else await ensure(db.from('bookmarks').insert({ user_id: userId, question_id: questionId })); },
    async reportQuestion(questionId, message) { if (!message.trim()) throw new Error('Hãy nhập nội dung báo lỗi.'); await ensure(db.from('reports').insert({ user_id: await currentUserId(), question_id: questionId, message: message.trim() })); },
    async updateMember(id, status) { if (id === await currentUserId()) throw new Error('Không thể khóa tài khoản quản trị đang sử dụng.'); await ensure(db.from('profiles').update({ status }).eq('id', id)); },
    async inviteEmail(email) { if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Địa chỉ email chưa hợp lệ.'); await ensure(db.from('invitations').upsert({ email: email.trim().toLowerCase(), invited_by: await currentUserId() })); },
    async logActivity(action, deckId) { await ensure(db.rpc('touch_activity', { p_action: action, p_deck_id: deckId ?? null })); },
    async checkAI(question, provider, model) {
      const { data, error } = await db.functions.invoke('verify-answer', { body: { questionId: question.id, provider, model: model || undefined, inputVersion: question.version } });
      if (error) { let detail = ''; try { const body = await (error as any).context?.json(); detail = body?.error ?? ''; } catch { /* no body */ } throw new Error(detail || error.message || 'Không gọi được dịch vụ AI.'); }
      if (data?.error) throw new Error(data.error);
      return data as AICheck;
    },
    async aiStatus() { const { data, error } = await db.functions.invoke('verify-answer', { body: { action: 'status' } }); if (error) throw new Error('Chưa kết nối được Edge Function verify-answer. Hãy triển khai function và kiểm tra quyền quản trị.'); return data as AIAvailability; },
    async resolveReport(id) { await ensure(db.from('reports').update({ status: 'resolved' }).eq('id', id)); },
    async signOut() { const { error } = await db.auth.signOut(); if (error) throw error; },
  };
  return repo;
}
