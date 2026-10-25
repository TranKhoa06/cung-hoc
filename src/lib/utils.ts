export const uid = () => crypto.randomUUID();
export const now = () => new Date().toISOString();
export function errorMessage(error: unknown): string { return error && typeof error === 'object' && 'message' in error && typeof error.message === 'string' ? error.message : String(error); }
export function downloadJson(name: string, data: unknown) { const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })); const link = document.createElement('a'); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
export function formatDate(value?: string) { return value ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : 'Chưa có hoạt động'; }
export function sameSet(a: string[], b: string[]) { return a.length === new Set(a).size && a.length === b.length && a.every(value => b.includes(value)); }
