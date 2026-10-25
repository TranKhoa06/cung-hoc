export type Role = 'admin' | 'member';
export type MemberStatus = 'pending' | 'active' | 'blocked';
export type QuestionKind = 'single' | 'multiple' | 'unknown';
export type Provider = 'gemini' | 'deepseek';
export interface Profile { id: string; email: string; name: string; role: Role; status: MemberStatus; createdAt: string; lastSeen?: string; }
export interface Deck { id: string; title: string; subject: string; description: string; color: string; status: 'draft' | 'published'; createdAt: string; }
export interface Choice { id: string; label: string; text: string; textEn?: string; }
export interface SourceOpinion { id: string; text: string; answerIds: string[]; explanation: string; sourceId?: string; }
export interface AIComment { opinionId: string; answerStatus: 'agree' | 'suspect' | 'uncertain'; explanationStatus: 'agree' | 'suspect' | 'uncertain' | 'absent'; reason: string; }
export type DraftAssessment = Omit<AIComment, 'opinionId'>;
export interface AICheck { id: string; questionId: string; inputVersion: number; provider: Provider; model: string; createdAt: string; status: 'clear' | 'review' | 'insufficient'; proposedAnswerIds: string[]; explanation: string; summary: string; comments: AIComment[]; draftAssessment?: DraftAssessment; usage?: Record<string, unknown>; }
export interface Question { id: string; deckId: string; chapter: string; number: number; prompt: string; promptEn?: string; choices: Choice[]; kind: QuestionKind; correctIds: string[]; explanation: string; memory: string; warning: string; sourceIds: string[]; questionImageIds: string[]; opinions: SourceOpinion[]; status: 'draft' | 'published'; reviewed: boolean; version: number; createdAt: string; aiCheck?: AICheck; sourceReference?: string; }
export interface SourceImage { id: string; deckId: string; name: string; kind: 'question' | 'opinion'; storagePath?: string; mime: string; rawText: string; text: string; status: 'queued' | 'running' | 'done' | 'error'; error?: string; createdAt: string; }
export interface Attempt { id: string; userId: string; questionId: string; version: number; selectedIds: string[]; correct: boolean; createdAt: string; }
export type Rating = 'again' | 'hard' | 'good' | 'easy';
export interface CardReview { id: string; userId: string; questionId: string; version: number; dueAt: string; intervalDays: number; repetitions: number; lastRating: Rating; reviewedAt: string; }
export interface Bookmark { userId: string; questionId: string; }
export interface Report { id: string; userId: string; questionId: string; message: string; createdAt: string; status: 'open' | 'resolved'; }
export interface Activity { id: string; userId: string; action: string; deckId?: string; createdAt: string; }
export interface AppData { decks: Deck[]; questions: Question[]; sources: SourceImage[]; attempts: Attempt[]; reviews: CardReview[]; bookmarks: Bookmark[]; profiles: Profile[]; reports: Report[]; activities: Activity[]; }
export interface AISettings { provider: Provider; model: string; }
export type Route = 'library' | 'quiz' | 'flashcards' | 'import' | 'content' | 'members' | 'settings';
export interface AIAvailability { gemini: boolean; deepseek: boolean; models?: Partial<Record<Provider, string>>; }
