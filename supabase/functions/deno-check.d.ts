// Local TypeScript verification only. The hosted Deno runtime provides these globals.
declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (request: Request) => Response | Promise<Response>): void };
declare module 'npm:@supabase/supabase-js@2.95.0' { export { createClient } from '@supabase/supabase-js'; }
