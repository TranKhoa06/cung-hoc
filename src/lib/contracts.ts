import type { AppData, Profile, Deck, Question, SourceImage, Attempt, CardReview, Rating, Provider, AICheck, AIAvailability, Activity } from '../model';
export interface Repository {
  mode: 'demo' | 'cloud';
  load(): Promise<AppData>;
  getProfile(): Promise<Profile | null>;
  saveDeck(deck: Deck): Promise<void>;
  saveQuestion(question: Question): Promise<void>;
  saveQuestions(questions: Question[]): Promise<void>;
  saveSource(source: SourceImage, blob?: Blob): Promise<void>;
  getSourceBlob(source: SourceImage): Promise<Blob | null>;
  recordAttempt(question: Question, selectedIds: string[]): Promise<Attempt>;
  reviewCard(question: Question, rating: Rating): Promise<CardReview>;
  toggleBookmark(questionId: string): Promise<void>;
  reportQuestion(questionId: string, message: string): Promise<void>;
  updateMember(id: string, status: Profile['status']): Promise<void>;
  inviteEmail(email: string): Promise<void>;
  logActivity(action: string, deckId?: string): Promise<void>;
  checkAI(question: Question, provider: Provider, model: string): Promise<AICheck>;
  aiStatus(): Promise<AIAvailability>;
  resolveReport(id: string): Promise<void>;
  signOut(): Promise<void>;
}
export interface FeatureProps { data: AppData; profile: Profile; repo: Repository; refresh: () => Promise<void>; notify: (message: string, kind?: 'success' | 'error') => void; }
