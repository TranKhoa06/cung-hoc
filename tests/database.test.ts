import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { asOwner, asUser, createTestDatabase } from './helpers/database';
import { createDemoData } from '../src/lib/demo';

const admin = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const member = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const pending = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const other = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const sample = createDemoData();
const deck = sample.decks[0];
const q = sample.questions[1];
let db: PGlite;
beforeAll(async () => {
  db = await createTestDatabase();
  for (const [id, email] of [[admin, 'admin@example.test'], [member, 'member@example.test'], [pending, 'pending@example.test'], [other, 'other@example.test']]) await db.query('insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)', [id, email, { full_name: email, role: 'admin', status: 'active' }]);
  await db.query("update public.profiles set role='admin',status='active' where id=$1", [admin]);
  await db.query("update public.profiles set status='active' where id in($1,$2)", [member, other]);
  await db.query('insert into public.decks(id,title,subject,description,color,status) values($1,$2,$3,$4,$5,$6)', [deck.id, deck.title, deck.subject, deck.description, deck.color, deck.status]);
  await db.query('insert into public.questions(id,deck_id,chapter,number,status,version,data) values($1,$2,$3,$4,$5,$6,$7)', [q.id, q.deckId, q.chapter, q.number, q.status, q.version, { ...q, opinions: [{ id: 'opinion', text: 'Private comment', answerIds: [], explanation: '' }], aiCheck: { summary: 'Private AI' } }]);
}, 30000);
afterAll(async () => { if (db) await db.close(); });

describe('phân quyền trên PostgreSQL thực', () => {
  it('signup luôn là member/pending dù metadata tự nhận admin', async () => { await asOwner(db); const result = await db.query<{ role: string; status: string }>('select role,status from public.profiles where id=$1', [pending]); expect(result.rows[0]).toEqual({ role: 'member', status: 'pending' }); });
  it('người chờ duyệt không đọc bộ học và không gọi RPC học', async () => { await asUser(db, pending); expect((await db.query('select * from public.decks')).rows).toHaveLength(0); await expect(db.query('select * from public.get_learning_questions()')).rejects.toThrow(); });
  it('thành viên không tự nâng quyền hoặc duyệt mình', async () => { await asUser(db, pending); await expect(db.query("update public.profiles set role='admin' where id=$1", [pending])).rejects.toThrow(); await db.query("update public.profiles set status='active' where id=$1", [pending]); await asOwner(db); expect((await db.query<{ status: string }>('select status from public.profiles where id=$1', [pending])).rows[0].status).toBe('pending'); });
  it('thành viên chỉ lấy câu xuất bản qua RPC, không thấy ý kiến/AI quản trị', async () => { await asUser(db, member); expect((await db.query('select * from public.questions')).rows).toHaveLength(0); const result = await db.query<{ data: any }>('select * from public.get_learning_questions()'); expect(result.rows).toHaveLength(1); expect(result.rows[0].data.opinions).toEqual([]); expect(result.rows[0].data.aiCheck).toBeUndefined(); expect((await db.query('select * from public.profiles')).rows).toHaveLength(1); });
  it('chấm nhiều đáp án phía máy chủ, lưu lần đầu và làm lại độc lập', async () => { await asUser(db, member); const partial = await db.query<{ correct: boolean }>('select * from public.submit_attempt($1,$2,$3)', [q.id, [q.correctIds[0]], 1]); expect(partial.rows[0].correct).toBe(false); const complete = await db.query<{ correct: boolean }>('select * from public.submit_attempt($1,$2,$3)', [q.id, [...q.correctIds].reverse(), 1]); expect(complete.rows[0].correct).toBe(true); expect((await db.query('select * from public.attempts')).rows).toHaveLength(2); await expect(db.query('update public.attempts set correct=true')).rejects.toThrow(); });
  it('không chấp nhận ID lạ, trùng hoặc phiên bản cũ', async () => { await asUser(db, member); await expect(db.query('select * from public.submit_attempt($1,$2,$3)', [q.id, ['missing'], 1])).rejects.toThrow(); await expect(db.query('select * from public.submit_attempt($1,$2,$3)', [q.id, [q.correctIds[0], q.correctIds[0]], 1])).rejects.toThrow(); await expect(db.query('select * from public.submit_attempt($1,$2,$3)', [q.id, q.correctIds, 99])).rejects.toThrow(); });
  it('tiến trình của hai người tách biệt', async () => { await asUser(db, other); expect((await db.query('select * from public.attempts')).rows).toHaveLength(0); await db.query('select * from public.review_card($1,$2,$3)', [q.id, 'easy', 1]); const reviews = await db.query<{ interval_days: number; repetitions: number }>('select * from public.card_reviews'); expect(reviews.rows[0].interval_days).toBe(4); expect(reviews.rows[0].repetitions).toBe(1); await asUser(db, member); expect((await db.query('select * from public.card_reviews')).rows).toHaveLength(0); });
  it('khóa thành viên có hiệu lực ở yêu cầu tiếp theo dù JWT không đổi', async () => { await asOwner(db); await db.query("update public.profiles set status='blocked' where id=$1", [other]); await asUser(db, other); expect((await db.query('select * from public.card_reviews')).rows).toHaveLength(0); await expect(db.query('select * from public.review_card($1,$2,$3)', [q.id, 'good', 1])).rejects.toThrow(); });
  it('duyệt và đổi trạng thái không đòi thay phiên bản nội dung', async () => { await asUser(db, admin); const draft = { ...sample.questions[0], status: 'draft', reviewed: false }; await db.query('insert into public.questions(id,deck_id,chapter,number,status,version,data) values($1,$2,$3,$4,$5,$6,$7)', [draft.id, draft.deckId, draft.chapter, draft.number, draft.status, draft.version, draft]); await db.query("update public.questions set status='published',data=$1 where id=$2", [{ ...draft, status: 'published', reviewed: true }, draft.id]); });
  it('ảnh bình luận và ảnh chưa gắn không lộ qua nguồn hoặc bucket riêng', async () => {
    await asOwner(db);
    const imageIds = ['eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee1', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee2', 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeee3'];
    for (const [index, id] of imageIds.entries()) {
      await db.query('insert into public.sources(id,deck_id,data,storage_path) values($1,$2,$3,$4)', [id, deck.id, { id, deckId: deck.id, kind: index === 1 ? 'opinion' : 'question', name: `source-${index}.png` }, `${id}/source.png`]);
      await db.query('insert into storage.objects(bucket_id,name) values($1,$2)', ['source-images', `${id}/source.png`]);
    }
    const illustrated = { ...sample.questions[2], sourceIds: imageIds, questionImageIds: [imageIds[0]] };
    await db.query('insert into public.questions(id,deck_id,chapter,number,status,version,data) values($1,$2,$3,$4,$5,$6,$7)', [illustrated.id, illustrated.deckId, illustrated.chapter, illustrated.number, illustrated.status, illustrated.version, illustrated]);
    await asUser(db, member);
    expect((await db.query('select id from public.sources')).rows).toEqual([{ id: imageIds[0] }]);
    expect((await db.query('select name from storage.objects')).rows).toEqual([{ name: `${imageIds[0]}/source.png` }]);
    await asOwner(db); await db.query("update public.decks set status='draft' where id=$1", [deck.id]);
    await asUser(db, member); expect((await db.query('select * from public.get_learning_questions()')).rows).toHaveLength(0); expect((await db.query('select * from storage.objects')).rows).toHaveLength(0);
    await asOwner(db); await db.query("update public.decks set status='published' where id=$1", [deck.id]);
  });
  it('chỉ dịch vụ hoàn tất AI, không áp kết quả cũ hoặc đổi đáp án chính thức', async () => {
    const check = { id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', questionId: q.id, inputVersion: 1, provider: 'gemini', model: 'test-model', status: 'review', proposedAnswerIds: ['option-1'], comments: [], explanation: 'Test only', summary: 'Test only', createdAt: new Date().toISOString() };
    await asUser(db, member); await expect(db.query('select public.finish_ai_check($1,$2,$3,$4)', [admin, q.id, 1, check])).rejects.toThrow();
    await asOwner(db); await expect(db.query('select public.finish_ai_check($1,$2,$3,$4)', [admin, q.id, 999, check])).rejects.toThrow();
    await db.query('select public.finish_ai_check($1,$2,$3,$4)', [admin, q.id, 1, check]);
    const saved = await db.query<{ data: any }>('select data from public.questions where id=$1', [q.id]);
    expect(saved.rows[0].data.correctIds).toEqual(q.correctIds); expect(saved.rows[0].data.explanation).toBe(q.explanation); expect(saved.rows[0].data.aiCheck.id).toBe(check.id);
    await db.query("update public.profiles set status='blocked' where id=$1", [admin]);
    await expect(db.query('select public.finish_ai_check($1,$2,$3,$4)', [admin, q.id, 1, { ...check, id: crypto.randomUUID() }])).rejects.toThrow();
    await db.query("update public.profiles set status='active' where id=$1", [admin]);
  });
});
