import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, FileText, ImagePlus, Plus, RotateCw, Scissors, Square, Upload, WandSparkles } from 'lucide-react';
import type { FeatureProps } from '../../lib/contracts';
import type { Deck, Question, SourceImage } from '../../model';
import { errorMessage, now, uid } from '../../lib/utils';
import { emptyQuestion, parseQuestions } from '../../lib/parser';
import { createOcrSession, transformImage } from '../../lib/ocr';
import { QuestionEditor, SourcePreview } from './shared';

export default function ImportWorkspace(props: FeatureProps) {
  const { data, repo, refresh, notify } = props;
  const [deckId, setDeckId] = useState(data.decks[0]?.id || '');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [kind, setKind] = useState<SourceImage['kind']>('question');
  const [selectedId, setSelectedId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState({ index: 0, total: 0, name: '', percent: 0, status: '' });
  const [statuses, setStatuses] = useState<Record<string, SourceImage['status']>>({});
  const [order, setOrder] = useState<string[]>([]);
  const [editor, setEditor] = useState<Question | null>(null);
  const [targetId, setTargetId] = useState('');
  const [crop, setCrop] = useState({ x: 0, y: 0, width: 100, height: 100 });
  const stop = useRef(false);
  const alive = useRef(true);
  const input = useRef<HTMLInputElement>(null);
  const sources = useMemo(() => data.sources.filter(source => source.deckId === deckId).sort((a, b) => {
    const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
    return (ai < 0 ? 100000 : ai) - (bi < 0 ? 100000 : bi) || a.name.localeCompare(b.name, 'vi', { numeric: true });
  }), [data.sources, deckId, order]);
  const selected = sources.find(source => source.id === selectedId);
  const questions = data.questions.filter(question => question.deckId === deckId);
  useEffect(() => { if (!deckId && data.decks[0]) setDeckId(data.decks[0].id); }, [data.decks, deckId]);
  useEffect(() => { setText(selected?.text || ''); setCrop({ x: 0, y: 0, width: 100, height: 100 }); }, [selectedId, selected?.text]);
  useEffect(() => {
    alive.current = true;
    const interrupted = data.sources.filter(source => source.status === 'running');
    if (interrupted.length) Promise.all(interrupted.map(source => repo.saveSource({ ...source, status: 'queued', error: 'Phiên trước bị dừng. Có thể tiếp tục OCR.' }))).then(refresh).catch(() => {});
    return () => { alive.current = false; stop.current = true; };
  }, [repo]);

  async function createDeck() {
    if (!title.trim()) return notify('Nhập tên bộ học trước.', 'error');
    setBusy(true);
    const deck: Deck = { id: uid(), title: title.trim(), subject: subject.trim() || 'Bộ học của nhóm', description: '', color: '#137347', status: 'draft', createdAt: now() };
    try { await repo.saveDeck(deck); await refresh(); setDeckId(deck.id); setTitle(''); notify('Đã tạo bộ học. Hãy thêm ảnh.'); } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); }
  }

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    if (!deckId) return notify('Tạo hoặc chọn bộ học trước khi thêm ảnh.', 'error');
    setBusy(true);
    let saved = 0; let lastId = '';
    try {
      for (const file of Array.from(files)) {
        if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 25 * 1024 * 1024) { notify(`Bỏ qua ${file.name}: chỉ nhận JPG/PNG/WebP tối đa 25 MB mỗi ảnh.`, 'error'); continue; }
        const source: SourceImage = { id: uid(), deckId, name: file.name, kind, mime: file.type, rawText: '', text: '', status: 'queued', createdAt: now() };
        await repo.saveSource(source, file); saved++; lastId = source.id;
      }
      await refresh(); if (lastId) setSelectedId(lastId);
      notify(`Đã lưu ${saved} ảnh ${kind === 'question' ? 'đề' : 'bình luận'}.`);
    } catch (error) { notify(`Đã lưu ${saved} ảnh. ${errorMessage(error)}`, 'error'); await refresh(); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  async function runOcr() {
    const queue = sources.filter(source => source.status !== 'done');
    if (!queue.length) return notify('Không còn ảnh chờ OCR. Chọn Chạy lại ở ảnh đã xử lý nếu cần.');
    setProcessing(true); stop.current = false;
    let session: Awaited<ReturnType<typeof createOcrSession>> | undefined;
    try {
      session = await createOcrSession(value => { if (alive.current) setProgress(current => ({ ...current, percent: Math.round(value.progress * 100), status: value.status })); });
      for (let index = 0; index < queue.length && !stop.current; index++) {
        const source = queue[index];
        setProgress({ index: index + 1, total: queue.length, name: source.name, percent: 0, status: 'Đang nhận dạng' });
        setStatuses(current => ({ ...current, [source.id]: 'running' }));
        await repo.saveSource({ ...source, status: 'running', error: undefined });
        try {
          const blob = await repo.getSourceBlob(source);
          if (!blob) throw new Error('Không tìm thấy dữ liệu ảnh. Hãy thêm lại ảnh nguồn.');
          const result = await session.recognize(blob);
          await repo.saveSource({ ...source, rawText: result, text: result, status: 'done', error: undefined });
          setStatuses(current => ({ ...current, [source.id]: 'done' }));
        } catch (error) {
          await repo.saveSource({ ...source, status: 'error', error: errorMessage(error) });
          setStatuses(current => ({ ...current, [source.id]: 'error' }));
        }
        if (alive.current) await refresh();
      }
      if (alive.current) notify(stop.current ? 'Đã dừng hàng đợi. Kết quả ảnh đang xử lý đã được lưu.' : 'Đã hoàn tất hàng đợi OCR. Hãy đối chiếu ảnh và chữ.');
    } catch (error) { if (alive.current) notify(errorMessage(error), 'error'); }
    finally {
      try { await session?.close(); } catch (error) { if (alive.current) notify(errorMessage(error), 'error'); }
      if (alive.current) { setProcessing(false); try { await refresh(); } catch (error) { notify(errorMessage(error), 'error'); } }
    }
  }

  async function saveText() {
    if (!selected) return;
    setBusy(true);
    try { await repo.saveSource({ ...selected, text }); await refresh(); notify('Đã lưu bản chữ chỉnh sửa. OCR thô vẫn được giữ.'); } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); }
  }

  async function extract() {
    if (!selected || !text.trim()) return notify('Chọn ảnh đã có văn bản để tách câu.', 'error');
    if (selected.kind !== 'question') return notify('Ảnh bình luận chỉ được gắn ý kiến, không tạo đáp án chính thức.', 'error');
    setBusy(true);
    try {
      await repo.saveSource({ ...selected, text });
      const parsed = parseQuestions(text, deckId, selected.id, questions.length + 1);
      if (!parsed.length) throw new Error('Chưa tìm thấy nội dung để tạo câu. Bạn có thể thêm câu thủ công.');
      await repo.saveQuestions(parsed); await refresh(); setEditor(parsed[0]);
      notify(`Đã tạo ${parsed.length} câu nháp. Chưa có đáp án nào được tự xác nhận.`);
    } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); }
  }

  async function attachOpinion() {
    const question = data.questions.find(item => item.id === targetId);
    if (!question || !selected || !text.trim()) return notify('Chọn câu đích và điền nội dung bình luận.', 'error');
    setBusy(true);
    try {
      const value = { ...question, opinions: [...question.opinions, { id: uid(), text: text.trim(), answerIds: [], explanation: '', sourceId: selected.id }], sourceIds: [...new Set([...question.sourceIds, selected.id])], status: 'draft' as const, reviewed: false, version: question.version + 1 };
      await repo.saveSource({ ...selected, text }); await repo.saveQuestion(value); await refresh(); setEditor(value);
      notify('Đã gắn ý kiến nguồn. Hãy tách từng bình luận trong màn duyệt nếu ảnh chứa nhiều người.');
    } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); }
  }

  async function transform(rotation: number, useCrop: boolean) {
    if (!selected) return;
    setBusy(true);
    try {
      const blob = await repo.getSourceBlob(selected); if (!blob) throw new Error('Không tải được ảnh gốc.');
      const bitmap = await createImageBitmap(blob);
      const area = useCrop ? { x: Math.round(bitmap.width * crop.x / 100), y: Math.round(bitmap.height * crop.y / 100), width: Math.round(bitmap.width * Math.min(crop.width, 100 - crop.x) / 100), height: Math.round(bitmap.height * Math.min(crop.height, 100 - crop.y) / 100) } : undefined;
      bitmap.close();
      if (area && (area.width < 10 || area.height < 10)) throw new Error('Vùng cắt quá nhỏ.');
      const result = await transformImage(blob, rotation, area);
      const next: SourceImage = { ...selected, id: uid(), kind: useCrop ? 'question' : selected.kind, name: `${selected.name.replace(/\.[^.]+$/, '')}-${useCrop ? 'cat' : 'xoay'}.jpg`, mime: 'image/jpeg', storagePath: undefined, rawText: '', text: '', status: 'queued', error: undefined, createdAt: now() };
      await repo.saveSource(next, result); await refresh(); setSelectedId(next.id); notify('Đã tạo ảnh xử lý mới, giữ nguyên ảnh gốc.');
    } catch (error) { notify(errorMessage(error), 'error'); } finally { setBusy(false); }
  }

  function move(id: string, direction: number) { const ids = sources.map(source => source.id); const from = ids.indexOf(id); const to = from + direction; if (to < 0 || to >= ids.length) return; [ids[from], ids[to]] = [ids[to], ids[from]]; setOrder(ids); }

  return <div className="admin-area stack">
    <header className="page-header"><div><p className="eyebrow">Không gian quản trị</p><h1>Thêm tài liệu</h1><p className="muted">Từ ảnh chụp đến bộ học — bạn duyệt trước khi cả nhóm cùng học.</p></div><span className="badge">01 Nhập ảnh · 02 OCR · 03 Duyệt</span></header>
    <section className="card stack"><div className="admin-row admin-between"><h3>Chọn bộ học</h3><span className="badge">{sources.length} ảnh · {questions.length} câu</span></div><label className="field">Bộ tài liệu<select value={deckId} disabled={processing} onChange={event => { setDeckId(event.target.value); setSelectedId(''); }}><option value="">Chọn hoặc tạo bộ mới</option>{data.decks.map(deck => <option value={deck.id} key={deck.id}>{deck.title}</option>)}</select></label><details><summary>Tạo bộ học mới</summary><div className="form-grid"><label className="field">Tên bộ học<input placeholder="Ví dụ: FPGA · Review PT2" value={title} onChange={event => setTitle(event.target.value)}/></label><label className="field">Môn học<input placeholder="Ví dụ: FAP201" value={subject} onChange={event => setSubject(event.target.value)}/></label></div><button className="button secondary" disabled={busy} onClick={createDeck}><Plus size={16}/>Tạo bộ học</button></details></section>
    <section className="admin-upload card" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (!busy && !processing) void upload(event.dataTransfer.files); }}><div className="admin-upload-icon"><ImagePlus size={30}/></div><h2>Thêm những ảnh bạn đã chụp</h2><p className="muted">Chọn nhiều ảnh JPG, PNG hoặc WebP. Mỗi ảnh tối đa 25 MB.</p><div className="admin-row"><select aria-label="Loại ảnh đang thêm" value={kind} onChange={event => setKind(event.target.value as SourceImage['kind'])}><option value="question">Ảnh đề / câu hỏi</option><option value="opinion">Ảnh bình luận / đáp án chưa xác minh</option></select><button className="button primary" disabled={!deckId || busy || processing} onClick={() => input.current?.click()}><Upload size={17}/>Chọn ảnh từ máy</button><input hidden ref={input} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={event => void upload(event.target.files)}/></div><small className="muted">Ảnh được lưu theo quyền riêng của nhóm. OCR chạy trên máy bạn; AI chỉ chạy khi bạn bấm kiểm tra.</small></section>
    <div className="toolbar"><div className="admin-row"><button className="button primary" disabled={busy || processing || !sources.length} onClick={runOcr}><WandSparkles size={17}/>{processing ? 'OCR đang chạy…' : 'OCR các ảnh đang chờ'}</button>{processing && <button className="button secondary" onClick={() => { stop.current = true; notify('Sẽ dừng sau khi lưu ảnh đang xử lý.'); }}><Square size={15}/>Dừng hàng đợi</button>}</div><button className="button secondary" disabled={!deckId || processing} onClick={() => setEditor(emptyQuestion(deckId, questions.length + 1))}><Plus size={16}/>Thêm câu thủ công</button></div>
    {processing && <section className="notice"><div className="admin-row admin-between"><strong>Ảnh {progress.index}/{progress.total}: {progress.name || 'Đang tải bộ nhận dạng Việt–Anh'}</strong><span>{progress.percent}%</span></div><div className="progress-track"><div className="progress-fill" style={{ width: `${progress.percent}%` }}/></div><small>{progress.status}. Giữ trang mở để xử lý; kết quả được lưu sau mỗi ảnh.</small></section>}
    {sources.length ? <div className="admin-import-columns"><aside className="card admin-source-list"><h3>Hàng đợi ảnh</h3><p className="muted">Có thể đổi thứ tự xử lý trong phiên này.</p>{sources.map((source, index) => <div key={source.id} className={`admin-source-item ${selectedId === source.id ? 'active' : ''}`}><button className="admin-source-select" onClick={() => setSelectedId(source.id)}><strong>{index + 1}. {source.name}</strong><small>{source.kind === 'question' ? 'Ảnh đề' : 'Ảnh bình luận'} · {{ queued: 'Chờ xử lý', running: 'Đang OCR', done: 'Đã có chữ', error: 'Có lỗi' }[statuses[source.id] || source.status]}</small></button><div className="admin-row"><button className="icon-button" aria-label="Đưa ảnh lên" disabled={processing || index === 0} onClick={() => move(source.id, -1)}><ArrowUp size={13}/></button><button className="icon-button" aria-label="Đưa ảnh xuống" disabled={processing || index === sources.length - 1} onClick={() => move(source.id, 1)}><ArrowDown size={13}/></button></div></div>)}</aside><section className="card stack">{selected ? <><div className="admin-row admin-between"><h3>{selected.name}</h3><button className="button ghost" disabled={processing || busy} onClick={async () => { try { await repo.saveSource({ ...selected, status: 'queued' }); setStatuses(current => ({ ...current, [selected.id]: 'queued' })); await refresh(); } catch (error) { notify(errorMessage(error), 'error'); } }}>Đưa vào hàng chờ OCR lại</button></div>{selected.error && <div className="notice error">{selected.error}</div>}<div className="admin-image-and-text"><div className="stack"><SourcePreview source={selected} repo={repo}/><div className="admin-row"><button className="button secondary" disabled={busy || processing} onClick={() => transform(1, false)}><RotateCw size={16}/>Xoay 90°</button><details><summary>Cắt ảnh theo phần trăm</summary><div className="admin-crop-inputs">{(['x', 'y', 'width', 'height'] as const).map(key => <label className="field" key={key}>{{ x: 'Trái %', y: 'Trên %', width: 'Rộng %', height: 'Cao %' }[key]}<input type="number" min={key === 'width' || key === 'height' ? 1 : 0} max="100" value={crop[key]} onChange={event => setCrop(current => ({ ...current, [key]: Math.max(key === 'width' || key === 'height' ? 1 : 0, Math.min(100, Number(event.target.value))) }))}/></label>)}</div><button className="button secondary" disabled={busy || processing} onClick={() => transform(0, true)}><Scissors size={16}/>Tạo ảnh cắt mới</button></details></div></div><div className="stack"><label className="field">Bản chữ để đối chiếu và chỉnh sửa<textarea rows={18} value={text} onChange={event => setText(event.target.value)} placeholder="Chạy OCR hoặc nhập nội dung đã chép…"/></label><button className="button secondary" disabled={busy || processing} onClick={saveText}>Lưu bản chữ chỉnh sửa</button><details><summary>Xem OCR thô (không bị ghi đè)</summary><pre className="admin-raw">{selected.rawText || 'Chưa có kết quả OCR.'}</pre></details></div></div>{selected.kind === 'question' ? <div className="notice"><p>Tách câu tạo bản nháp, không tự đoán đáp án. Nếu đề nối qua nhiều ảnh, bạn có thể ghép phần chữ rồi tách, hoặc chỉnh trong màn duyệt.</p><button className="button primary" disabled={busy || processing || !text.trim()} onClick={extract}><FileText size={17}/>Tách thành câu hỏi nháp</button></div> : <section className="notice warning stack"><strong>Ảnh bình luận không phải khóa đáp án chuẩn</strong><label className="field">Gắn nội dung này vào câu<select value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">Chọn câu hỏi tương ứng</option>{questions.map(question => <option key={question.id} value={question.id}>Câu {question.number}: {question.prompt.slice(0, 70)}</option>)}</select></label><button className="button primary" disabled={busy || !targetId || !text.trim()} onClick={attachOpinion}>Gắn ý kiến và mở màn kiểm tra</button></section>}</> : <div className="empty-state"><ImagePlus/><h3>Chọn một ảnh trong hàng đợi</h3><p>Ảnh gốc và văn bản OCR sẽ hiển thị cạnh nhau.</p></div>}</section></div> : <section className="empty-state"><ImagePlus size={32}/><h3>Bắt đầu từ ảnh đầu tiên</h3><p>Chọn bộ học, thêm ảnh đề và ảnh bình luận theo từng nhóm.</p></section>}
    {editor && <QuestionEditor {...props} question={editor} onClose={() => setEditor(null)}/>}
  </div>;
}
