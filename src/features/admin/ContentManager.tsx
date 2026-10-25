import { useMemo, useRef, useState } from 'react';
import { BookOpen, Download, FileCheck2, Filter, Plus, Search, Upload } from 'lucide-react';
import type { FeatureProps } from '../../lib/contracts';
import type { Question } from '../../model';
import { downloadJson, errorMessage, formatDate, uid } from '../../lib/utils';
import { emptyQuestion, parseImportPackage, validateForPublish } from '../../lib/parser';
import { QuestionEditor } from './shared';
import BatchAI from './BatchAI';

export default function ContentManager(props: FeatureProps) {
  const { data, repo, refresh, notify } = props;
  const [deckId, setDeckId] = useState('all');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [editor, setEditor] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkConfirmed, setBulkConfirmed] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const visible = useMemo(() => data.questions.filter(question => (deckId === 'all' || question.deckId === deckId) && (filter === 'all' || filter === 'draft' && question.status === 'draft' || filter === 'published' && question.status === 'published' || filter === 'review' && (question.warning || !question.aiCheck || question.aiCheck.status !== 'clear' || question.aiCheck.inputVersion !== question.version)) && `${question.prompt} ${question.chapter} ${question.number}`.toLocaleLowerCase('vi').includes(search.toLocaleLowerCase('vi'))).sort((a, b) => a.number - b.number), [data.questions, deckId, filter, search]);
  const openReports = data.reports.filter(report => report.status === 'open');
  const bulkCandidates = visible.filter(question => question.status === 'draft');
  const bulkValid = bulkCandidates.map(question => ({ ...question, reviewed: true, status: 'published' as const })).filter(question => validateForPublish(question).length === 0);

  async function publishBulk() {
    if (!bulkConfirmed || !bulkValid.length) return;
    setBusy(true);
    try {
      await repo.saveQuestions(bulkValid); await refresh(); setBulkConfirmed(false); setBulkOpen(false);
      notify(`Đã duyệt và xuất bản ${bulkValid.length} câu. Câu thiếu dữ liệu vẫn ở bản nháp. Bạn có thể mở bộ học khi sẵn sàng.`);
    } catch (error) { notify(errorMessage(error), 'error'); await refresh(); } finally { setBusy(false); }
  }

  async function importJson(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error('Gói JSON quá 30 MB. Hãy chia thành các bộ nhỏ.');
      const value = parseImportPackage(JSON.parse(await file.text()));
      const existingDecks = new Set(data.decks.map(deck => deck.id));
      const existingQuestions = new Set(data.questions.map(question => question.id));
      const deckMap = new Map(value.decks.map(deck => [deck.id, existingDecks.has(deck.id) ? uid() : deck.id]));
      // Importing is additive: a backup must not silently overwrite the live bank.
      for (const deck of value.decks) await repo.saveDeck({ ...deck, id: deckMap.get(deck.id)!, title: existingDecks.has(deck.id) ? `${deck.title} (bản nhập)` : deck.title });
      const questions = value.questions.map(question => ({ ...question, id: existingQuestions.has(question.id) ? uid() : question.id, deckId: deckMap.get(question.deckId)! }));
      await repo.saveQuestions(questions); await refresh();
      notify(`Đã nhập ${value.decks.length} bộ và ${questions.length} câu ở trạng thái nháp. Cần bạn duyệt trước khi xuất bản.`);
    } catch (error) { notify(errorMessage(error), 'error'); await refresh(); } finally { setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }

  async function toggleDeck(id: string) {
    const deck = data.decks.find(item => item.id === id); if (!deck) return;
    if (deck.status !== 'published' && !data.questions.some(question => question.deckId === id && question.status === 'published')) return notify('Duyệt và xuất bản ít nhất một câu trước khi mở bộ học.', 'error');
    setBusy(true);
    try { await repo.saveDeck({ ...deck, status: deck.status === 'published' ? 'draft' : 'published' }); await refresh(); notify(deck.status === 'published' ? 'Đã ẩn bộ học với thành viên.' : 'Đã mở bộ học cho thành viên được duyệt.'); } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); }
  }

  return <div className="admin-area stack">
    <header className="page-header"><div><p className="eyebrow">Ngân hàng kiến thức của nhóm</p><h1>Nội dung & duyệt bài</h1><p className="muted">Đáp án đã duyệt là nội dung chính thức. Bình luận và AI luôn là nguồn tham khảo.</p></div><button className="button primary" disabled={!data.decks.length} onClick={() => setEditor(emptyQuestion(deckId !== 'all' ? deckId : data.decks[0].id, data.questions.length + 1))}><Plus size={17}/>Thêm câu</button></header>
    <section className="stat-grid"><div className="stat-card"><FileCheck2/><strong>{data.questions.filter(question => question.status === 'published').length}</strong><span>Câu đã xuất bản</span></div><div className="stat-card"><BookOpen/><strong>{data.questions.filter(question => question.status === 'draft').length}</strong><span>Câu đang duyệt</span></div><div className="stat-card"><Filter/><strong>{openReports.length}</strong><span>Báo lỗi chưa xử lý</span></div></section>
    <div className="toolbar"><div className="admin-row"><button className="button secondary" onClick={() => downloadJson('cung-hoc-sao-luu-noi-dung.json', { format: 'cung-hoc', version: 1, exportedAt: new Date().toISOString(), decks: data.decks, questions: data.questions })}><Download size={16}/>Xuất nội dung JSON</button><button className="button secondary" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={16}/>Nhập bộ từ JSON</button><input type="file" ref={fileInput} accept="application/json,.json" hidden onChange={event => void importJson(event.target.files?.[0])}/></div><small className="muted">Sao lưu chữ và đáp án; ảnh nguồn không kèm trong tệp JSON.</small></div>
    <section className="card stack"><div className="admin-row admin-between"><h3>Các bộ học</h3><small className="muted">Mở bộ sau khi câu hỏi đã được duyệt.</small></div>{!data.decks.length && <p className="muted">Chưa có bộ học. Vào Thêm tài liệu để tạo bộ đầu tiên.</p>}{data.decks.map(deck => <div key={deck.id} className="admin-deck-row"><div><strong>{deck.title}</strong><p className="muted">{deck.subject} · {data.questions.filter(question => question.deckId === deck.id).length} câu</p></div><span className={`badge ${deck.status === 'published' ? 'success' : 'warning'}`}>{deck.status === 'published' ? 'Đã mở cho nhóm' : 'Chỉ quản trị'}</span><button className="button secondary" disabled={busy} onClick={() => toggleDeck(deck.id)}>{deck.status === 'published' ? 'Ẩn bộ học' : 'Mở bộ học'}</button></div>)}</section>
    <div className="toolbar"><div className="admin-search"><Search size={18}/><input aria-label="Tìm trong câu hỏi" placeholder="Tìm câu hỏi, chương…" value={search} onChange={event => { setSearch(event.target.value); setBulkConfirmed(false); }}/></div><select aria-label="Lọc bộ học" value={deckId} onChange={event => { setDeckId(event.target.value); setBulkConfirmed(false); }}><option value="all">Tất cả bộ học</option>{data.decks.map(deck => <option value={deck.id} key={deck.id}>{deck.title}</option>)}</select><select aria-label="Lọc trạng thái câu" value={filter} onChange={event => { setFilter(event.target.value); setBulkConfirmed(false); }}><option value="all">Tất cả trạng thái</option><option value="draft">Bản nháp</option><option value="published">Đã xuất bản</option><option value="review">Cần xem lại / chưa kiểm tra AI</option></select><button className="button secondary" disabled={!bulkCandidates.length} onClick={() => { setBulkOpen(current => !current); setBulkConfirmed(false); }}>Duyệt nhiều câu</button></div>
    <BatchAI {...props} questions={visible}/>
    {bulkOpen && <section className="notice warning stack"><h3>Duyệt các câu nháp đang nằm trong bộ lọc</h3><p>Có {bulkValid.length}/{bulkCandidates.length} câu đủ cấu trúc và khóa đáp án để xuất bản. {bulkCandidates.length - bulkValid.length} câu thiếu dữ liệu sẽ giữ ở bản nháp. Bộ lọc hiện tại quyết định phạm vi này.</p><p>Thao tác này không có nghĩa AI đã xác minh đúng. Hãy mở và kiểm tra từng câu, đặc biệt những câu có ghi chú đáp án dự kiến hoặc lời giải còn nghi ngờ.</p><label className="admin-check"><input type="checkbox" checked={bulkConfirmed} onChange={event => setBulkConfirmed(event.target.checked)}/>Tôi đã tự đối chiếu toàn bộ {bulkValid.length} câu đủ điều kiện trong phạm vi này, gồm các cảnh báo; tôi xác nhận đáp án và lời giải để xuất bản.</label><div className="admin-row"><button className="button primary" disabled={busy || !bulkConfirmed || !bulkValid.length} onClick={publishBulk}>Xác nhận duyệt {bulkValid.length} câu</button><button className="button ghost" onClick={() => setBulkOpen(false)}>Hủy</button></div></section>}
    {visible.length ? <section className="card admin-question-list">{visible.map(question => <button className="admin-question-row" key={question.id} onClick={() => setEditor(question)}><span className="admin-question-number">{question.number}</span><div className="admin-question-summary"><strong>{question.prompt || 'Câu chưa có nội dung'}</strong><small>{data.decks.find(deck => deck.id === question.deckId)?.title} · {question.chapter || 'Chưa chia chương'} · {question.choices.length} lựa chọn · v{question.version}</small></div><div className="admin-tags"><span className={`badge ${question.status === 'published' ? 'success' : 'warning'}`}>{question.status === 'published' ? 'Đã duyệt' : 'Nháp'}</span>{question.aiCheck && <span className={`badge ${question.aiCheck.inputVersion !== question.version || question.aiCheck.status !== 'clear' ? 'warning' : 'success'}`}>{question.aiCheck.inputVersion !== question.version ? 'AI đã cũ' : question.aiCheck.status === 'clear' ? 'AI chưa thấy lỗi' : 'Cần xem lại'}</span>}</div><span className="admin-chevron">↗</span></button>)}</section> : <section className="empty-state"><BookOpen size={30}/><h3>Chưa có câu phù hợp</h3><p>Đổi bộ lọc, nhập bộ từ JSON hoặc thêm ảnh để bắt đầu.</p></section>}
    {openReports.length > 0 && <section className="card stack"><h3>Báo lỗi từ người học</h3>{openReports.map(report => <div className="admin-report" key={report.id}><div><strong>Câu {data.questions.find(question => question.id === report.questionId)?.number || '?'}</strong><p className="admin-preserve">{report.message}</p><small className="muted">{data.profiles.find(profile => profile.id === report.userId)?.name || 'Thành viên'} · {formatDate(report.createdAt)}</small></div><div className="admin-row"><button className="button secondary" onClick={() => setEditor(data.questions.find(question => question.id === report.questionId) || null)}>Xem câu</button><button className="button secondary" onClick={async () => { try { await repo.resolveReport(report.id); await refresh(); notify('Đã đánh dấu báo lỗi được xử lý.'); } catch (error) { notify(errorMessage(error), 'error'); } }}>Đã xử lý</button></div></div>)}</section>}
    {editor && <QuestionEditor {...props} question={editor} onClose={() => setEditor(null)}/>}
  </div>;
}
