import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readdirSync, readFileSync } from 'node:fs';

/** Real PostgreSQL policies, with minimal stand-ins for Supabase's platform schemas. */
export async function createTestDatabase() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create role supabase_admin nologin superuser;
    create schema auth;
    create schema storage;
    create schema extensions;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}', raw_app_meta_data jsonb not null default '{}', email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function auth.role() returns text language sql stable as $$ select current_user::text $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('sub',auth.uid(),'role',current_user::text) $$;
    create table storage.buckets (id text primary key, name text, public boolean default false, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(), unique(bucket_id,name));
    alter table storage.objects enable row level security;
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name,'/'))[1:greatest(array_length(string_to_array(name,'/'),1)-1,0)] $$;
    grant usage on schema auth,storage,public to authenticated,anon,service_role;
    grant all on all tables in schema storage to authenticated,service_role;
    grant execute on all functions in schema auth,storage to authenticated,anon,service_role;
  `);
  const folder = new URL('../../supabase/migrations/', import.meta.url);
  for (const name of readdirSync(folder).filter(name => name.endsWith('.sql')).sort()) await db.exec(readFileSync(new URL(name, folder), 'utf8'));
  return db;
}
export async function asUser(db: PGlite, id: string) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
  await db.exec('set role authenticated');
}
export async function asOwner(db: PGlite) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub','',false)"); }
