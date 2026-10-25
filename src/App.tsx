import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronRight, GraduationCap, Layers3, LoaderCircle, LogOut, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import type { AppData, Profile, Route } from './model';
import type { Repository, FeatureProps } from './lib/contracts';
import { createCloudRepository, createDemoRepository } from './lib/repository';
import { cloudConfigured, signInWithGoogle, supabase } from './lib/supabase';
import { errorMessage } from './lib/utils';
import Layout from './components/Layout';
import Library from './features/study/Library';
import Quiz from './features/study/Quiz';
import Flashcards from './features/study/Flashcards';
const ImportWorkspace = lazy(() => import('./features/admin/ImportWorkspace'));
const ContentManager = lazy(() => import('./features/admin/ContentManager'));
const MembersManager = lazy(() => import('./features/admin/MembersManager'));
const SettingsPanel = lazy(() => import('./features/admin/SettingsPanel'));
const routes: Route[] = ['library', 'quiz', 'flashcards', 'import', 'content', 'members', 'settings'];
const blankData: AppData = { decks: [], questions: [], sources: [], attempts: [], reviews: [], bookmarks: [], profiles: [], reports: [], activities: [] };
function readRoute() { const params = new URLSearchParams(location.hash.replace(/^#\/?/, '')); return { route: routes.includes(params.get('view') as Route) ? params.get('view') as Route : 'library' as Route, deckId: params.get('deck') ?? undefined }; }

export default function App() {
  const [repo, setRepo] = useState<Repository | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [data, setData] = useState<AppData>(blankData);
  const [loading, setLoading] = useState(true);
  const [fatal, setFatal] = useState('');
  const [authVersion, setAuthVersion] = useState(0);
  const authenticatedId = useRef<string | null>(null);
  const [routeState, setRouteState] = useState(readRoute);
  const [toast, setToast] = useState<{ message: string; kind: 'success' | 'error' } | null>(null);
  const notify = useCallback((message: string, kind: 'success' | 'error' = 'success') => setToast({ message, kind }), []);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(null), toast.kind === 'error' ? 10000 : 5000); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { const handler = () => setRouteState(readRoute()); addEventListener('hashchange', handler); return () => removeEventListener('hashchange', handler); }, []);
  function navigate(route: Route, deckId?: string) { const params = new URLSearchParams({ view: route }); if (deckId) params.set('deck', deckId); location.hash = params.toString(); setRouteState({ route, deckId }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  useEffect(() => {
    if (!supabase) return;
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== 'SIGNED_IN' && event !== 'SIGNED_OUT') return;
      const id = session?.user.id ?? null;
      if (id === authenticatedId.current) return;
      authenticatedId.current = id;
      setTimeout(() => setAuthVersion(value => value + 1), 0);
    });
    return () => listener.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    let cancelled = false;
    async function initialize() {
      setLoading(true); setFatal('');
      try {
        let next: Repository | null = null;
        let signedInAt = '';
        if (!cloudConfigured && sessionStorage.getItem('cung-hoc:demo') === 'yes') next = await createDemoRepository();
        else if (supabase) { const { data: sessionData, error } = await supabase.auth.getSession(); if (error) throw error; authenticatedId.current = sessionData.session?.user.id ?? null; signedInAt = sessionData.session?.user.last_sign_in_at ?? ''; if (sessionData.session) next = createCloudRepository(); }
        if (cancelled) return;
        setRepo(next);
        if (next) {
          const user = await next.getProfile();
          if (!user) throw new Error('Chưa có hồ sơ thành viên. Hãy kiểm tra migration và trigger tạo hồ sơ trong hướng dẫn Supabase.');
          const records = user.status === 'active' ? await next.load() : blankData;
          if (!cancelled) { setProfile(user); setData(records); }
          if (user.status === 'active' && !cancelled) {
            void next.logActivity('visit').catch(() => {});
            const marker = `cung-hoc:login:${user.id}`;
            if (signedInAt && sessionStorage.getItem(marker) !== signedInAt) void next.logActivity('login').then(() => sessionStorage.setItem(marker, signedInAt)).catch(() => {});
          }
        } else { setProfile(null); setData(blankData); }
      } catch (error) { if (!cancelled) setFatal(errorMessage(error)); }
      finally { if (!cancelled) setLoading(false); }
    }
    void initialize();
    return () => { cancelled = true; };
  }, [authVersion]);
  const refresh = useCallback(async () => {
    if (!repo) return;
    const user = await repo.getProfile();
    setProfile(user);
    if (!user || user.status !== 'active') { setData(blankData); return; }
    setData(await repo.load());
  }, [repo]);
  useEffect(() => {
    if (!repo || repo.mode !== 'cloud') return;
    const check = () => { void refresh().catch(error => { setData(blankData); setFatal(errorMessage(error)); }); };
    const timer = setInterval(check, 60000);
    const focus = () => { if (document.visibilityState === 'visible') check(); };
    document.addEventListener('visibilitychange', focus);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', focus); };
  }, [repo, refresh]);
  async function signOut() { try { await repo?.signOut(); setRepo(null); setProfile(null); setData(blankData); setFatal(''); navigate('library'); } catch (error) { notify(errorMessage(error), 'error'); } }
  if (loading) return <div className="boot-screen"><div className="brand-emblem"><GraduationCap size={28}/></div><LoaderCircle className="spin"/><p>Đang mở góc học của bạn…</p></div>;
  if (fatal) return <div className="boot-screen"><ShieldCheck size={40}/><h1>Chưa kết nối được dữ liệu</h1><p className="notice error">{fatal}</p><div className="toolbar"><button className="button primary" onClick={() => setAuthVersion(v => v + 1)}>Thử lại</button><button className="button secondary" onClick={() => { void signOut(); }}>Về trang đăng nhập</button></div><p className="muted">Nếu mới cài đặt, hãy chạy migration và cấp quyền quản trị theo README.</p></div>;
  if (!repo || !profile) return <><Landing onDemo={() => { sessionStorage.setItem('cung-hoc:demo', 'yes'); setAuthVersion(v => v + 1); }} notify={notify} />{toast && <div className={`toast ${toast.kind}`} role="alert"><span>{toast.message}</span><button aria-label="Đóng thông báo" onClick={() => setToast(null)}><X size={16}/></button></div>}</>;
  if (profile.status !== 'active') return <div className="boot-screen"><div className="brand-emblem"><Users size={30}/></div><p className="eyebrow">CÙNG HỌC</p><h1>{profile.status === 'pending' ? 'Đang chờ bạn quản trị duyệt' : 'Tài khoản đang bị khóa'}</h1><p className="muted">{profile.email}</p><p>{profile.status === 'pending' ? 'Bạn đã đăng nhập thành công. Khi được duyệt, các bộ học của nhóm sẽ xuất hiện tại đây.' : 'Hãy liên hệ chủ nhóm để kiểm tra quyền tham gia.'}</p><div className="toolbar"><button className="button primary" onClick={() => { void refresh().catch(error => notify(errorMessage(error), 'error')); }}>Kiểm tra lại</button><button className="button secondary" onClick={() => { void signOut(); }}><LogOut size={16}/>Đăng xuất</button></div></div>;
  const props: FeatureProps = { data, profile, repo, refresh, notify };
  const route = profile.role === 'admin' || ['library', 'quiz', 'flashcards'].includes(routeState.route) ? routeState.route : 'library';
  return <>
    <Layout profile={profile} mode={repo.mode} route={route} onNavigate={navigate} onSignOut={() => { void signOut(); }}>
      <Suspense fallback={<div className="empty-state"><LoaderCircle className="spin"/><p>Đang mở…</p></div>}>
        {route === 'library' && <Library {...props} onNavigate={navigate}/>}
        {route === 'quiz' && <Quiz {...props} deckId={routeState.deckId} onNavigate={navigate}/>}
        {route === 'flashcards' && <Flashcards {...props} deckId={routeState.deckId} onNavigate={navigate}/>}
        {profile.role === 'admin' && route === 'import' && <ImportWorkspace {...props}/>}
        {profile.role === 'admin' && route === 'content' && <ContentManager {...props}/>}
        {profile.role === 'admin' && route === 'members' && <MembersManager {...props}/>}
        {profile.role === 'admin' && route === 'settings' && <SettingsPanel {...props}/>}
      </Suspense>
    </Layout>
    {toast && <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>{toast.kind === 'success' ? <Check size={18}/> : <ShieldCheck size={18}/>}<span>{toast.message}</span><button aria-label="Đóng thông báo" onClick={() => setToast(null)}><X size={16}/></button></div>}
  </>;
}

function Landing({ onDemo, notify }: { onDemo: () => void; notify: (message: string, kind?: 'success' | 'error') => void }) {
  const [busy, setBusy] = useState(false);
  async function login() { setBusy(true); try { await signInWithGoogle(); } catch (error) { notify(errorMessage(error), 'error'); setBusy(false); } }
  return <main className="landing">
    <header className="landing-header"><a className="landing-brand" href="#"><span className="brand-emblem"><GraduationCap size={25}/></span><span>Cùng học<span className="brand-caption">MỖI NGÀY MỘT CHÚT</span></span></a><span className="landing-header-note"><Users size={16}/>Một góc học chung, tiến bộ riêng</span></header>
    <section className="landing-hero">
      <div className="landing-copy"><span className="hero-kicker"><span/>GÓC HỌC CỦA CHÚNG MÌNH</span><h1>Hiểu từng câu.<br/>Nhớ <em>lâu hơn.</em></h1><p className="hero-description">Từ những trang ghi chú đến bộ câu hỏi rõ ràng.<br/>Luyện tập, ôn thẻ và cùng nhau đi thêm một chút mỗi ngày.</p>
        <div className="hero-actions"><button className="button primary hero-login" disabled={!cloudConfigured || busy} onClick={() => { void login(); }}>{busy ? <LoaderCircle className="spin" size={18}/> : <GoogleMark/>}Tiếp tục với Google<ArrowRight size={18}/></button>{!cloudConfigured && <button className="button secondary" onClick={onDemo}>Khám phá bản mẫu<ArrowRight size={18}/></button>}</div>
        <p className="login-disclosure"><ShieldCheck size={15}/>{cloudConfigured ? 'Dành cho thành viên được chủ nhóm duyệt.' : 'Bản mẫu hoạt động trên thiết bị. Đăng nhập thật cần kết nối Supabase.'}</p>
        <p className="privacy-disclosure">Khi tham gia nhóm, chủ nhóm có thể xem email, hoạt động truy cập và tiến độ học của bạn.</p>
        <div className="hero-benefits"><span><BookOpen size={18}/>Trắc nghiệm có lời giải</span><span><Layers3 size={18}/>Ôn thẻ theo lịch riêng</span></div>
      </div>
      <div className="hero-visual" aria-label="Minh họa giao diện học"><div className="hero-orbit orbit-one"/><div className="hero-orbit orbit-two"/><div className="floating-note"><span className="floating-icon"><Sparkles size={17}/></span>Hiểu bản chất, nhớ tự nhiên.</div><div className="hero-study-card"><div className="mini-card-top"><span>FPGA · NHẬP MÔN</span><span>01 / 05</span></div><div className="mini-progress"><i/></div><span className="mini-question-label">MỖI CÂU HỎI LÀ MỘT BƯỚC TIẾN</span><h2>Một clock có chu kỳ 10 ns.<br/>Tần số tương ứng là bao nhiêu?</h2><div className="mini-option"><b>A</b>10 MHz</div><div className="mini-option"><b>B</b>50 MHz</div><div className="mini-option selected"><b>C</b>100 MHz<Check size={17}/></div><div className="mini-option"><b>D</b>1 GHz</div><div className="mini-memory"><span>GHI NHỚ NHANH</span>Tần số là nghịch đảo của chu kỳ.<br/><strong>f = 1/T</strong></div><div className="mini-card-bottom"><span>Đã hiểu thêm một điều.</span><ChevronRight size={17}/></div></div><div className="floating-flash"><Layers3 size={21}/><div><strong>Hẹn gặp lại kiến thức</strong><span>Ôn đúng lúc, từng thẻ một.</span></div></div></div>
    </section>
    <footer className="landing-footer"><span>Cùng học · Một nơi để học cùng nhau.</span><span>Trắc nghiệm · Flashcard · Học từ ảnh</span></footer>
  </main>;
}
function GoogleMark() { return <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.88-1.73 2.99-4.28 2.99-7.36ZM12 22c2.7 0 4.96-.9 6.61-2.41l-3.22-2.51c-.9.6-2.04.97-3.39.97-2.6 0-4.8-1.76-5.59-4.12H3.09v2.59A10 10 0 0 0 12 22ZM6.41 13.93A6 6 0 0 1 6.1 12c0-.67.11-1.32.31-1.93V7.48H3.09A10 10 0 0 0 2 12c0 1.61.39 3.14 1.09 4.52l3.32-2.59ZM12 5.95c1.47 0 2.79.51 3.83 1.51l2.87-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.91 5.48l3.32 2.59C7.2 7.71 9.4 5.95 12 5.95Z"/></svg>; }
