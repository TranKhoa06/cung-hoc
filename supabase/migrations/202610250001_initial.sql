begin;
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,email text not null,name text not null default '',role text not null default 'member' check(role in ('admin','member')),status text not null default 'pending' check(status in ('pending','active','blocked')),created_at timestamptz not null default now(),last_seen timestamptz);
create unique index profiles_email_lower_idx on public.profiles(lower(email));
create table public.invitations(email text primary key check(email=lower(trim(email)) and length(email) between 3 and 254),invited_by uuid references public.profiles(id),created_at timestamptz not null default now());
create table public.decks(id uuid primary key,title text not null check(length(title) between 1 and 250),subject text not null default '',description text not null default '',color text not null default '#137347',status text not null default 'draft' check(status in ('draft','published')),created_at timestamptz not null default now());
create table public.sources(id uuid primary key,deck_id uuid not null references public.decks(id),data jsonb not null check(jsonb_typeof(data)='object'),storage_path text,created_at timestamptz not null default now(),check(data ? 'id' and data ? 'deckId' and data->>'id'=id::text and data->>'deckId'=deck_id::text),check(storage_path is null or split_part(storage_path,'/',1)=id::text));
create table public.questions(id uuid primary key,deck_id uuid not null references public.decks(id),chapter text not null default '',number integer not null default 1 check(number>0),status text not null default 'draft' check(status in ('draft','published')),version integer not null default 1 check(version>0),data jsonb not null check(jsonb_typeof(data)='object'),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index questions_deck_status_idx on public.questions(deck_id,status);
create table public.attempts(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),question_id uuid not null references public.questions(id),version integer not null,selected_ids text[] not null,correct boolean not null,created_at timestamptz not null default now());
create index attempts_user_question_idx on public.attempts(user_id,question_id,created_at);
create table public.card_reviews(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),question_id uuid not null references public.questions(id),version integer not null,due_at timestamptz not null,interval_days double precision not null default 0,repetitions integer not null default 0,last_rating text not null check(last_rating in ('again','hard','good','easy')),reviewed_at timestamptz not null default now(),unique(user_id,question_id));
create table public.bookmarks(user_id uuid not null references public.profiles(id),question_id uuid not null references public.questions(id),primary key(user_id,question_id));
create table public.reports(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),question_id uuid not null references public.questions(id),message text not null check(length(trim(message)) between 1 and 4000),status text not null default 'open' check(status in ('open','resolved')),created_at timestamptz not null default now());
create table public.activities(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),action text not null check(length(action) between 1 and 80),deck_id uuid references public.decks(id),created_at timestamptz not null default now());
create table public.ai_checks(id uuid primary key,question_id uuid not null references public.questions(id),input_version integer not null,provider text not null check(provider in ('gemini','deepseek')),model text not null,data jsonb not null,created_at timestamptz not null default now());
create table public.ai_jobs(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),created_at timestamptz not null default now());
create function public.is_active_member() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active') $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.profiles where id=auth.uid() and status='active' and role='admin') $$;
create function public.can_read_question(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.is_admin() or(public.is_active_member() and exists(select 1 from public.questions q join public.decks d on d.id=q.deck_id where q.id=p_id and q.status='published' and d.status='published')) $$;
create function public.can_read_source(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$ select public.is_admin() or(public.is_active_member() and exists(select 1 from public.questions q join public.decks d on d.id=q.deck_id where q.status='published' and d.status='published' and coalesce(q.data->'questionImageIds','[]'::jsonb) ? p_id::text)) $$;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$ begin insert into public.profiles(id,email,name,status) values(new.id,lower(new.email),coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),case when exists(select 1 from public.invitations i where i.email=lower(new.email)) then 'active' else 'pending' end); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.validate_question() returns trigger language plpgsql set search_path='' as $$
declare choices jsonb; answers jsonb; item jsonb; option_ids text[]; answer_ids text[];
begin
 if new.data->>'id' is distinct from new.id::text or new.data->>'deckId' is distinct from new.deck_id::text or new.data->>'status' is distinct from new.status or new.data->>'version' is distinct from new.version::text then raise exception 'Question identity, deck, status or version does not match JSON'; end if;
 choices:=new.data->'choices'; answers:=new.data->'correctIds';
 if jsonb_typeof(choices) is distinct from 'array' or jsonb_array_length(choices)>100 or jsonb_typeof(answers) is distinct from 'array' then raise exception 'Invalid choices or answers'; end if;
 select coalesce(array_agg(x->>'id'),'{}'::text[]) into option_ids from jsonb_array_elements(choices) x;
 select coalesce(array_agg(x),'{}'::text[]) into answer_ids from jsonb_array_elements_text(answers) x;
 if exists(select 1 from unnest(option_ids) x where x is null or length(x)=0) or cardinality(option_ids)<>(select count(distinct x) from unnest(option_ids) x) or cardinality(answer_ids)<>(select count(distinct x) from unnest(answer_ids) x) or not(answer_ids <@ option_ids) then raise exception 'Invalid or duplicate answer IDs'; end if;
 if new.status='published' and(coalesce((new.data->>'reviewed')::boolean,false)=false or length(trim(coalesce(new.data->>'prompt','')))=0 or cardinality(option_ids)<2 or cardinality(answer_ids)<1 or coalesce(new.data->>'kind','unknown') not in ('single','multiple') or(new.data->>'kind'='single' and cardinality(answer_ids)<>1) or exists(select 1 from jsonb_array_elements(choices) x where length(trim(coalesce(x->>'text','')))=0)) then raise exception 'Published questions require reviewed prompt, choices, kind and valid answers'; end if;
 if tg_op='UPDATE' and new.version<old.version then raise exception 'Stale question version'; end if;
 if tg_op='UPDATE' and new.version=old.version and(new.data-'aiCheck'-'status'-'reviewed') is distinct from(old.data-'aiCheck'-'status'-'reviewed') then raise exception 'Question content changed: increment version before saving'; end if;
 if jsonb_typeof(coalesce(new.data->'questionImageIds','[]'::jsonb))<>'array' then raise exception 'Invalid question image IDs'; end if;
 for item in select value from jsonb_array_elements(coalesce(new.data->'questionImageIds','[]'::jsonb)) loop
  if not exists(select 1 from public.sources s where s.id::text=(item#>>'{}') and s.deck_id=new.deck_id and s.data->>'kind'='question') then raise exception 'Question image must reference a question source in the same deck'; end if;
 end loop;
 new.updated_at:=now(); return new;
end $$;
create trigger questions_validate before insert or update on public.questions for each row execute function public.validate_question();

alter table public.profiles enable row level security;
alter table public.invitations enable row level security;
alter table public.decks enable row level security;
alter table public.sources enable row level security;
alter table public.questions enable row level security;
alter table public.attempts enable row level security;
alter table public.card_reviews enable row level security;
alter table public.bookmarks enable row level security;
alter table public.reports enable row level security;
alter table public.activities enable row level security;
alter table public.ai_checks enable row level security;
alter table public.ai_jobs enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy profile_admin_update on public.profiles for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy invitations_admin on public.invitations for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy decks_read on public.decks for select to authenticated using(public.is_admin() or(public.is_active_member() and status='published'));
create policy decks_admin on public.decks for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy questions_admin on public.questions for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy sources_read on public.sources for select to authenticated using(public.can_read_source(id));
create policy sources_admin on public.sources for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy attempts_read on public.attempts for select to authenticated using(public.is_admin() or(public.is_active_member() and user_id=auth.uid()));
create policy reviews_read on public.card_reviews for select to authenticated using(public.is_admin() or(public.is_active_member() and user_id=auth.uid()));
create policy bookmarks_read on public.bookmarks for select to authenticated using(public.is_admin() or(public.is_active_member() and user_id=auth.uid()));
create policy bookmarks_insert on public.bookmarks for insert to authenticated with check(user_id=auth.uid() and public.is_active_member() and public.can_read_question(question_id));
create policy bookmarks_delete on public.bookmarks for delete to authenticated using(user_id=auth.uid() and public.is_active_member());
create policy reports_read on public.reports for select to authenticated using(public.is_admin() or(public.is_active_member() and user_id=auth.uid()));
create policy reports_insert on public.reports for insert to authenticated with check(user_id=auth.uid() and status='open' and public.is_active_member() and public.can_read_question(question_id));
create policy reports_admin_update on public.reports for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy activities_read on public.activities for select to authenticated using(public.is_admin() or(public.is_active_member() and user_id=auth.uid()));
create policy activities_insert on public.activities for insert to authenticated with check(user_id=auth.uid() and public.is_active_member());
create policy ai_checks_admin_read on public.ai_checks for select to authenticated using(public.is_admin());
revoke all on public.profiles,public.invitations,public.decks,public.sources,public.questions,public.attempts,public.card_reviews,public.bookmarks,public.reports,public.activities,public.ai_checks,public.ai_jobs from anon,authenticated;
grant usage on schema public to authenticated;
grant select on public.profiles,public.invitations,public.decks,public.sources,public.questions,public.attempts,public.card_reviews,public.bookmarks,public.reports,public.activities,public.ai_checks to authenticated;
grant insert,update on public.invitations,public.decks,public.sources,public.questions to authenticated;
grant update(status) on public.profiles to authenticated;
grant insert,delete on public.bookmarks to authenticated;
grant insert on public.reports to authenticated;
grant update(status) on public.reports to authenticated;
-- Deletion of questions/decks/sources is deliberately not granted: archived drafts preserve history.
create function public.get_learning_questions() returns setof public.questions language plpgsql stable security definer set search_path='' as $$
begin
 if not public.is_active_member() then raise exception 'Access denied'; end if;
 return query select q.id,q.deck_id,q.chapter,q.number,q.status,q.version,
  (q.data-'opinions'-'aiCheck'-'sourceIds')||jsonb_build_object('opinions','[]'::jsonb,'sourceIds',coalesce(q.data->'questionImageIds','[]'::jsonb)),q.created_at,q.updated_at
 from public.questions q join public.decks d on d.id=q.deck_id where q.status='published' and d.status='published' order by q.deck_id,q.number,q.id;
end $$;
create function public.submit_attempt(p_question_id uuid,p_selected_ids text[],p_version integer) returns setof public.attempts language plpgsql security definer set search_path='' as $$
declare q public.questions; option_ids text[]; answer_ids text[]; selection text[];
begin
 if not public.is_active_member() or not public.can_read_question(p_question_id) then raise exception 'Access denied'; end if;
 select * into q from public.questions where id=p_question_id;
 if q.version<>p_version then raise exception 'Question changed; reload before answering'; end if;
 if q.status<>'published' or coalesce((q.data->>'reviewed')::boolean,false)=false then raise exception 'Question is not ready for learning'; end if;
 if(select count(*) from public.attempts where user_id=auth.uid() and created_at>now()-interval '1 minute')>=120 then raise exception 'Too many attempts; wait a minute'; end if;
 select coalesce(array_agg(x->>'id'),'{}'::text[]) into option_ids from jsonb_array_elements(q.data->'choices') x;
 select coalesce(array_agg(x),'{}'::text[]) into answer_ids from jsonb_array_elements_text(q.data->'correctIds') x;
 selection:=coalesce(p_selected_ids,'{}'::text[]);
 if cardinality(selection)=0 or cardinality(selection)>cardinality(option_ids) or cardinality(selection)<>(select count(distinct x) from unnest(selection) x) or not(selection <@ option_ids) or(q.data->>'kind'='single' and cardinality(selection)<>1) then raise exception 'Invalid answer selection'; end if;
 update public.profiles set last_seen=now() where id=auth.uid();
 return query insert into public.attempts(user_id,question_id,version,selected_ids,correct) values(auth.uid(),q.id,q.version,selection,(selection @> answer_ids and selection <@ answer_ids)) returning *;
end $$;
create function public.review_card(p_question_id uuid,p_rating text,p_version integer) returns setof public.card_reviews language plpgsql security definer set search_path='' as $$
declare q public.questions; prev public.card_reviews; days double precision; reps integer; due timestamptz;
begin
 if not public.is_active_member() or not public.can_read_question(p_question_id) then raise exception 'Access denied'; end if;
 if p_rating not in('again','hard','good','easy') then raise exception 'Invalid rating'; end if;
 select * into q from public.questions where id=p_question_id;
 if q.version<>p_version then raise exception 'Question changed; reload before reviewing'; end if;
 if q.status<>'published' or coalesce((q.data->>'reviewed')::boolean,false)=false then raise exception 'Question is not ready for learning'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text||p_question_id::text));
 select * into prev from public.card_reviews where user_id=auth.uid() and question_id=p_question_id for update;
 if prev.version is distinct from q.version then prev.interval_days:=0; prev.repetitions:=0; end if;
 reps:=case when p_rating='again' then 0 else coalesce(prev.repetitions,0)+1 end;
 days:=case p_rating when 'again' then 0 when 'hard' then greatest(1,round(coalesce(prev.interval_days,0)*1.2)) when 'good' then greatest(1,round(coalesce(prev.interval_days,0)*2.5)) when 'easy' then greatest(4,round(coalesce(prev.interval_days,0)*3.5)) end;
 due:=case when p_rating='again' then now()+interval '10 minutes' else now()+make_interval(secs=>days*86400) end;
 update public.profiles set last_seen=now() where id=auth.uid();
 return query insert into public.card_reviews(user_id,question_id,version,due_at,interval_days,repetitions,last_rating,reviewed_at) values(auth.uid(),q.id,q.version,due,days,reps,p_rating,now()) on conflict(user_id,question_id) do update set version=excluded.version,due_at=excluded.due_at,interval_days=excluded.interval_days,repetitions=excluded.repetitions,last_rating=excluded.last_rating,reviewed_at=excluded.reviewed_at returning *;
end $$;
create function public.touch_activity(p_action text,p_deck_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_active_member() then raise exception 'Access denied'; end if;
 if length(p_action) not between 1 and 80 then raise exception 'Invalid activity'; end if;
 if p_deck_id is not null and not(public.is_admin() or exists(select 1 from public.decks where id=p_deck_id and status='published')) then raise exception 'Access denied'; end if;
 update public.profiles set last_seen=now() where id=auth.uid();
 insert into public.activities(user_id,action,deck_id) values(auth.uid(),p_action,p_deck_id);
end $$;
create function public.reserve_ai_job(p_user_id uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
 perform pg_advisory_xact_lock(hashtext(p_user_id::text));
 if not exists(select 1 from public.profiles where id=p_user_id and role='admin' and status='active') then raise exception 'Access denied'; end if;
 if(select count(*) from public.ai_jobs where user_id=p_user_id and created_at>now()-interval '5 minutes')>=30 then raise exception 'AI check limit reached. Wait five minutes.'; end if;
 insert into public.ai_jobs(user_id) values(p_user_id) returning id into result;
 delete from public.ai_jobs where created_at<now()-interval '7 days'; return result;
end $$;
revoke all on function public.handle_new_user(),public.validate_question(),public.is_active_member(),public.is_admin(),public.can_read_question(uuid),public.can_read_source(uuid),public.get_learning_questions(),public.submit_attempt(uuid,text[],integer),public.review_card(uuid,text,integer),public.touch_activity(text,uuid),public.reserve_ai_job(uuid) from public;
grant execute on function public.is_active_member(),public.is_admin(),public.can_read_question(uuid),public.can_read_source(uuid),public.get_learning_questions(),public.submit_attempt(uuid,text[],integer),public.review_card(uuid,text,integer),public.touch_activity(text,uuid) to authenticated;
grant execute on function public.reserve_ai_job(uuid) to service_role;
grant all on public.profiles,public.invitations,public.decks,public.sources,public.questions,public.attempts,public.card_reviews,public.bookmarks,public.reports,public.activities,public.ai_checks,public.ai_jobs to service_role;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('source-images','source-images',false,26214400,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy source_files_read on storage.objects for select to authenticated using(bucket_id='source-images' and(public.is_admin() or exists(select 1 from public.sources s where s.storage_path=name and public.can_read_source(s.id))));
create policy source_files_insert on storage.objects for insert to authenticated with check(bucket_id='source-images' and public.is_admin());
create policy source_files_update on storage.objects for update to authenticated using(bucket_id='source-images' and public.is_admin()) with check(bucket_id='source-images' and public.is_admin());
create policy source_files_delete on storage.objects for delete to authenticated using(bucket_id='source-images' and public.is_admin());
commit;

