import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Image as ImageIcon, Plus, Save, Sparkles, Trash2, X } from 'lucide-react';
import type { FeatureProps, Repository } from '../../lib/contracts';
import type { Question, SourceImage, Provider, AIAvailability } from '../../model';
import { errorMessage, formatDate, uid } from '../../lib/utils';
import { revisedQuestion, validateForPublish } from '../../lib/parser';
import './admin.css';

export function SourcePreview({ source, repo }: { source: SourceImage; repo: Repository }) {
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true; let objectUrl = '';
    setUrl(''); setFailed(false);
    repo.getSourceBlob(source).then(blob => {
      if (!live) return;
      if (blob) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } else setFailed(true);
    }).catch(() => live && setFailed(true));
    return () => { live = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [source.id, source.storagePath, repo]);
  return url ? <a className="admin-image-link" href={url} target="_blank" rel="noreferrer" title="Mở ảnh để phóng to"><img src={url} alt={source.name} loading="lazy" /></a> : <div className="admin-image-placeholder"><ImageIcon size={24}/><span>{failed ? 'Không tải được ảnh' : 'Đang tải ảnh…'}</span></div>;
}

export function CheckResult({ question }: { question: Question }) {
  const check = question.aiCheck;
  if (!check) return <p className="muted">Chưa kiểm tra bằng AI. Các bình luận chưa phải đáp án chuẩn.</p>;
  const stale = check.inputVersion !== question.version;
  const names = check.proposedAnswerIds.map(id => question.choices.find(choice => choice.id === id)?.label || '?').join(', ');
  return <section className={`notice ${stale || check.status !== 'clear' ? 'warning' : 'success'}`}>
    <div className="admin-row"><Sparkles size={17}/><strong>{stale ? 'Kết quả đã cũ — cần kiểm tra lại' : check.status === 'clear' ? 'AI chưa phát hiện vấn đề' : check.status === 'insufficient' ? 'Chưa đủ căn cứ' : 'AI đề nghị xem lại'}</strong></div>
    <p>{check.summary}</p><p><strong>Đáp án AI đề xuất:</strong> {names || 'Chưa kết luận'}</p>
    {check.explanation && <p className="admin-preserve">{check.explanation}</p>}
    {check.draftAssessment && <div className="admin-ai-comment"><strong>Đáp án / lời giải đang soạn</strong><div className="admin-tags"><span className={`badge ${check.draftAssessment.answerStatus === 'suspect' ? 'danger' : check.draftAssessment.answerStatus === 'agree' ? 'success' : 'warning'}`}>Đáp án: {check.draftAssessment.answerStatus === 'suspect' ? 'nghi sai' : check.draftAssessment.answerStatus === 'agree' ? 'đồng ý' : 'chưa rõ'}</span><span className={`badge ${check.draftAssessment.explanationStatus === 'suspect' ? 'danger' : 'warning'}`}>Giải thích: {check.draftAssessment.explanationStatus === 'suspect' ? 'nghi sai' : check.draftAssessment.explanationStatus === 'agree' ? 'chưa thấy lỗi' : check.draftAssessment.explanationStatus === 'absent' ? 'không có' : 'chưa rõ'}</span></div><p>{check.draftAssessment.reason}</p></div>}
    {check.comments.map((comment, index) => <div key={comment.opinionId || index} className="admin-ai-comment"><strong>Ý kiến {question.opinions.findIndex(opinion => opinion.id === comment.opinionId) + 1 || index + 1}</strong><div className="admin-tags"><span className={`badge ${comment.answerStatus === 'suspect' ? 'danger' : comment.answerStatus === 'agree' ? 'success' : 'warning'}`}>Đáp án: {comment.answerStatus === 'suspect' ? 'nghi sai' : comment.answerStatus === 'agree' ? 'đồng ý' : 'chưa rõ'}</span><span className={`badge ${comment.explanationStatus === 'suspect' ? 'danger' : 'warning'}`}>Giải thích: {comment.explanationStatus === 'suspect' ? 'nghi sai' : comment.explanationStatus === 'agree' ? 'chưa thấy lỗi' : comment.explanationStatus === 'absent' ? 'không có' : 'chưa rõ'}</span></div><p>{comment.reason}</p></div>)}
    <small>{check.provider} · {check.model} · {formatDate(check.createdAt)}. AI có thể sai; bạn duyệt kết quả cuối.</small>
  </section>;
}

export function QuestionEditor({ question, data, repo, refresh, notify, onClose, onSaved }: FeatureProps & { question: Question; onClose: () => void; onSaved?: (question: Question) => void }) {
  const [original, setOriginal] = useState(question);
  const [draft, setDraft] = useState<Question>(structuredClone(question));
  const [busy, setBusy] = useState(false);
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState('');
  const [availability, setAvailability] = useState<AIAvailability>({ gemini: false, deepseek: false });
  const [acknowledged, setAcknowledged] = useState(false);
  const dialogRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLElement>('button, input, textarea')?.focus();
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = oldOverflow; if (previous?.isConnected) previous.focus(); };
  }, []);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); if (!busy) onClose(); }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),select:not([disabled]),summary,[tabindex="0"]')].filter(element => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, [busy, onClose]);
  useEffect(() => { repo.aiStatus().then(status => { setAvailability(status); setModel(status.models?.gemini || ''); }).catch(() => {}); }, [repo]);
  const patch = (change: Partial<Question>) => { setDraft(current => ({ ...current, ...change, reviewed: 'reviewed' in change ? Boolean(change.reviewed) : false })); setAcknowledged(false); };
  const sources = data.sources.filter(source => source.deckId === draft.deckId);
  const images = sources.filter(source => draft.sourceIds.includes(source.id));
  const current = data.questions.some(value => value.id === draft.id) ? revisedQuestion(original, draft) : { ...draft, version: 1, aiCheck: undefined };
  const aiStale = Boolean(draft.aiCheck && draft.aiCheck.inputVersion !== current.version);
  const needsAttention = Boolean(draft.warning || aiStale || draft.aiCheck?.status !== 'clear');

  async function save(status: Question['status']) {
    const value = { ...current, status };
    if (status === 'published') {
      const errors = validateForPublish(value);
      if (errors.length) { notify(errors.join(' '), 'error'); return; }
      if (needsAttention && !acknowledged) { notify('Xác nhận bạn đã tự kiểm tra các cảnh báo trước khi xuất bản.', 'error'); return; }
    }
    setBusy(true);
    try {
      await repo.saveQuestion(value);
      setOriginal(value); setDraft(value);
      await refresh(); onSaved?.(value);
      notify(status === 'published' ? 'Đã xuất bản câu hỏi.' : 'Đã lưu bản nháp.');
    } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); }
  }

  async function verifyAI() {
    if (!draft.prompt.trim() || draft.choices.length < 2 || draft.choices.some(choice => !choice.text.trim())) { notify('Điền đủ đề và các lựa chọn trước khi kiểm tra AI.', 'error'); return; }
    if (!availability[provider]) { notify('Chưa cấu hình API key cho dịch vụ này trong Supabase Secrets.', 'error'); return; }
    setBusy(true);
    try {
      const saved = { ...current, status: 'draft' as const };
      await repo.saveQuestion(saved); setOriginal(saved); setDraft(saved);
      const check = await repo.checkAI(saved, provider, model.trim());
      const checked = { ...saved, aiCheck: check };
      setOriginal(checked); setDraft(checked); await refresh();
      notify('Đã kiểm tra bằng một model. Hãy xem riêng đáp án và phần giải thích.');
    } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); }
  }

  return <div className="modal-backdrop admin-editor-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}><section ref={dialogRef} className="modal admin-editor" role="dialog" aria-modal="true" aria-labelledby="editor-title">
    <header className="admin-row admin-between"><div><p className="eyebrow">Đối chiếu · kiểm tra · duyệt</p><h2 id="editor-title">Câu {draft.number}</h2></div><button className="icon-button" aria-label="Đóng trình sửa" disabled={busy} onClick={onClose}><X/></button></header>
    <div className="admin-editor-columns">
      <div className="stack">
        <div className="form-grid"><label className="field">Chương<input value={draft.chapter} onChange={event => patch({ chapter: event.target.value })}/></label><label className="field">Số câu<input type="number" min="1" value={draft.number} onChange={event => patch({ number: Math.max(1, Number(event.target.value)) })}/></label></div>
        <label className="field">Nội dung câu hỏi<textarea rows={5} value={draft.prompt} onChange={event => patch({ prompt: event.target.value })}/></label>
        <details><summary>Bản tiếng Anh (nếu có)</summary><label className="field"><textarea rows={3} value={draft.promptEn || ''} onChange={event => patch({ promptEn: event.target.value })}/></label></details>
        <label className="field">Loại câu<select value={draft.kind} onChange={event => patch({ kind: event.target.value as Question['kind'], correctIds: [] })}><option value="unknown">Chưa xác định — cần duyệt</option><option value="single">Một đáp án đúng</option><option value="multiple">Nhiều đáp án đúng</option></select></label>
        <div><div className="admin-row admin-between"><h3>Lựa chọn và đáp án đúng</h3><button className="button ghost" onClick={() => patch({ choices: [...draft.choices, { id: uid(), label: String.fromCharCode(65 + draft.choices.length), text: '' }] })}><Plus size={16}/>Thêm lựa chọn</button></div><p className="muted">Không giới hạn bốn lựa chọn. Đánh dấu đáp án sau khi tự kiểm tra.</p>
          <div className="stack">{draft.choices.map((choice, index) => <div className="admin-option-editor" key={choice.id}><input aria-label={`Chọn ${choice.label} là đáp án đúng`} type={draft.kind === 'single' ? 'radio' : 'checkbox'} name="correct-answer" checked={draft.correctIds.includes(choice.id)} onChange={event => patch({ correctIds: draft.kind === 'single' ? [choice.id] : event.target.checked ? [...draft.correctIds, choice.id] : draft.correctIds.filter(id => id !== choice.id) })}/><input className="admin-option-label" aria-label={`Nhãn lựa chọn ${index + 1}`} value={choice.label} onChange={event => patch({ choices: draft.choices.map(item => item.id === choice.id ? { ...item, label: event.target.value } : item) })}/><textarea aria-label={`Nội dung lựa chọn ${index + 1}`} rows={2} value={choice.text} onChange={event => patch({ choices: draft.choices.map(item => item.id === choice.id ? { ...item, text: event.target.value } : item) })}/><button className="icon-button" aria-label={`Xóa lựa chọn ${choice.label}`} onClick={() => patch({ choices: draft.choices.filter(item => item.id !== choice.id), correctIds: draft.correctIds.filter(id => id !== choice.id) })}><Trash2 size={16}/></button></div>)}</div>
        </div>
        <label className="field">Lời giải cuối<textarea rows={5} value={draft.explanation} onChange={event => patch({ explanation: event.target.value })}/></label>
        <label className="field">Ghi nhớ / mặt sau flashcard<textarea rows={3} value={draft.memory} onChange={event => patch({ memory: event.target.value })}/></label>
        <label className="field">Ghi chú cần lưu ý<textarea rows={2} value={draft.warning} onChange={event => patch({ warning: event.target.value })}/></label>
        <details><summary>Ảnh nguồn và hình minh họa cho AI</summary><p className="muted">Chỉ chọn hình đã cắt riêng phần đề/sơ đồ cho AI giải độc lập. Không chọn ảnh còn chứa bình luận hoặc đáp án.</p>{sources.map(source => <div key={source.id} className="admin-source-check"><label><input type="checkbox" checked={draft.sourceIds.includes(source.id)} onChange={event => patch({ sourceIds: event.target.checked ? [...draft.sourceIds, source.id] : draft.sourceIds.filter(id => id !== source.id), questionImageIds: event.target.checked ? draft.questionImageIds : draft.questionImageIds.filter(id => id !== source.id) })}/>Nguồn: {source.name}</label>{source.kind === 'question' && draft.sourceIds.includes(source.id) && <label><input type="checkbox" checked={draft.questionImageIds.includes(source.id)} onChange={event => patch({ questionImageIds: event.target.checked ? [...draft.questionImageIds, source.id] : draft.questionImageIds.filter(id => id !== source.id) })}/>Chỉ chứa đề/hình — gửi AI</label>}</div>)}</details>
        {images.map(source => <div key={source.id}><small>{source.name}</small><SourcePreview source={source} repo={repo}/></div>)}
      </div>
      <aside className="stack admin-review-column">
        <section className="card stack"><div className="admin-row admin-between"><h3>Ý kiến từ ảnh</h3><button className="button ghost" onClick={() => patch({ opinions: [...draft.opinions, { id: uid(), text: '', answerIds: [], explanation: '' }] })}><Plus size={16}/>Thêm ý kiến</button></div><p className="muted">Giữ riêng từng bình luận. Số người đồng ý không xác minh tính đúng.</p>
          {!draft.opinions.length && <p className="muted">Chưa gắn bình luận. Có thể kiểm tra chỉ từ đề.</p>}
          {draft.opinions.map((opinion, index) => <div key={opinion.id} className="admin-opinion"><div className="admin-row admin-between"><strong>Ý kiến {index + 1}</strong><button className="icon-button" aria-label="Xóa ý kiến" onClick={() => patch({ opinions: draft.opinions.filter(item => item.id !== opinion.id) })}><X size={15}/></button></div><label className="field">Nguyên văn<textarea rows={3} value={opinion.text} onChange={event => patch({ opinions: draft.opinions.map(item => item.id === opinion.id ? { ...item, text: event.target.value } : item) })}/></label><div className="admin-tags">{draft.choices.map(choice => <label key={choice.id}><input type="checkbox" checked={opinion.answerIds.includes(choice.id)} onChange={event => patch({ opinions: draft.opinions.map(item => item.id === opinion.id ? { ...item, answerIds: event.target.checked ? [...item.answerIds, choice.id] : item.answerIds.filter(id => id !== choice.id) } : item) })}/>{choice.label}</label>)}</div><label className="field">Giải thích trong bình luận<textarea rows={2} value={opinion.explanation} onChange={event => patch({ opinions: draft.opinions.map(item => item.id === opinion.id ? { ...item, explanation: event.target.value } : item) })}/></label></div>)}
        </section>
        <section className="card stack"><div className="admin-row"><Sparkles size={20}/><h3>Kiểm tra bằng AI</h3></div><p className="muted">Mỗi lần chỉ dùng một model: giải đề trước, đối chiếu bình luận sau. Hai lượt gọi cùng model.</p><div className="form-grid"><label className="field">Dịch vụ<select value={provider} onChange={event => { const value = event.target.value as Provider; setProvider(value); setModel(availability.models?.[value] || ''); }}><option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option></select></label><label className="field">Model<input placeholder="Dùng cấu hình máy chủ" value={model} onChange={event => setModel(event.target.value)}/></label></div><small className="muted">{availability[provider] ? 'API đã cấu hình. Nội dung liên quan được gửi tới dịch vụ đã chọn.' : 'Chưa có API key trên máy chủ. Không tạo kết quả kiểm tra giả.'}</small><button className="button primary" disabled={busy || !availability[provider]} onClick={verifyAI}><Sparkles size={17}/>{busy ? 'Đang xử lý…' : 'Lưu nháp và kiểm tra AI'}</button>
          <CheckResult question={{ ...draft, version: current.version }}/>
          {draft.aiCheck && !aiStale && draft.aiCheck.proposedAnswerIds.length > 0 && <button className="button secondary" onClick={() => patch({ correctIds: draft.aiCheck!.proposedAnswerIds, explanation: draft.aiCheck!.explanation })}>Dùng đề xuất làm bản nháp để tôi duyệt</button>}
        </section>
        <div className="notice warning"><AlertTriangle size={18}/><p>AI chỉ đề xuất. Không có bình luận hoặc kết quả AI nào tự trở thành đáp án chính thức.</p></div>
      </aside>
    </div>
    <footer className="admin-editor-footer stack"><label className="admin-check"><input type="checkbox" checked={draft.reviewed} onChange={event => patch({ reviewed: event.target.checked })}/>Tôi đã đối chiếu đề, đáp án và lời giải; đồng ý dùng nội dung này cho bộ học.</label>{needsAttention && <label className="admin-check"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)}/>Tôi đã tự kiểm tra các cảnh báo / nội dung chưa được AI xác minh.</label>}<div className="admin-row admin-between"><span className="muted">Phiên bản {current.version} · {draft.status === 'published' ? 'Đang xuất bản' : 'Bản nháp'}</span><div className="admin-row"><button className="button secondary" disabled={busy} onClick={() => save('draft')}><Save size={16}/>Lưu bản nháp</button><button className="button primary" disabled={busy} onClick={() => save('published')}><Check size={16}/>Duyệt và xuất bản</button></div></div></footer>
  </section></div>;
}
