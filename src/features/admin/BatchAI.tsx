import { useEffect, useRef, useState } from 'react';
import { Sparkles, Square } from 'lucide-react';
import type { FeatureProps } from '../../lib/contracts';
import type { AIAvailability, Provider, Question } from '../../model';
import { errorMessage } from '../../lib/utils';

export default function BatchAI({ questions, repo, refresh, notify }: FeatureProps & { questions: Question[] }) {
  const [provider, setProvider] = useState<Provider>('gemini');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<AIAvailability>({ gemini: false, deepseek: false });
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ total: 0, done: 0, question: 0, failed: '' });
  const stop = useRef(false);
  const live = useRef(true);
  useEffect(() => { live.current = true; void repo.aiStatus().then(value => { if (live.current) { setStatus(value); setModel(value.models?.gemini ?? ''); } }).catch(() => {}); return () => { live.current = false; stop.current = true; }; }, [repo]);
  const pending = questions.filter(q => (!q.aiCheck || q.aiCheck.inputVersion !== q.version) && q.prompt.trim() && q.choices.length >= 2 && q.choices.every(c => c.text.trim()));
  async function run() {
    if (running || !status[provider] || !pending.length) return;
    const queue = pending.slice(0, 25);
    const chosenProvider = provider;
    const chosenModel = model.trim();
    setRunning(true); stop.current = false; setProgress({ total: queue.length, done: 0, question: queue[0].number, failed: '' });
    let done = 0;
    try {
      for (const question of queue) {
        if (stop.current) break;
        if (live.current) setProgress(value => ({ ...value, question: question.number }));
        await repo.checkAI(question, chosenProvider, chosenModel);
        done++;
        if (live.current) { setProgress(value => ({ ...value, done })); await refresh(); }
      }
      if (live.current) notify(`Đã kiểm tra ${done} câu bằng ${chosenProvider}. Các kết quả vẫn chờ bạn duyệt.`);
    } catch (error) {
      if (live.current) { setProgress(value => ({ ...value, failed: errorMessage(error) })); notify(`Hàng đợi dừng sau ${done} câu. ${errorMessage(error)}`, 'error'); }
    } finally {
      if (live.current) { setRunning(false); try { await refresh(); } catch (error) { notify(errorMessage(error), 'error'); } }
    }
  }
  return <details className="card stack"><summary><strong>Kiểm tra AI các câu trong bộ lọc</strong></summary><p className="muted">{pending.length} câu đủ chữ và lựa chọn chưa có kết quả AI hiện hành. Mỗi đợt tối đa 25 câu, lần lượt từng câu; mỗi câu hai lượt gọi cùng một model. Không tự áp dụng đáp án hoặc xuất bản.</p><div className="form-grid"><label className="field">Dịch vụ<select disabled={running} value={provider} onChange={event => { const next = event.target.value as Provider; setProvider(next); setModel(status.models?.[next] ?? ''); }}><option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option></select></label><label className="field">Model<input disabled={running} value={model} placeholder="Dùng cấu hình máy chủ" onChange={event => setModel(event.target.value)}/></label></div><p className="muted">{status[provider] ? 'Khi bấm, nội dung liên quan được gửi tới dịch vụ đã chọn; phí API theo tài khoản của bạn.' : 'Cần kết nối Supabase và gán API key của dịch vụ này.'}</p><div className="admin-row"><button className="button secondary" disabled={running || !status[provider] || !pending.length} onClick={() => { void run(); }}><Sparkles size={16}/>{running ? `Đang kiểm tra câu ${progress.question}…` : `Kiểm tra ${Math.min(pending.length, 25)} câu tiếp theo`}</button>{running && <button className="button ghost" onClick={() => { stop.current = true; }}><Square size={15}/>Dừng sau câu đang chạy</button>}</div>{progress.total > 0 && <p role="status">Đã lưu {progress.done}/{progress.total} kết quả.{progress.failed && <span className="text-red"> {progress.failed}</span>}</p>}</details>;
}
