begin;
-- Complete AI check atomically: no stale result may attach after an editor changes the question.
create function public.finish_ai_check(p_user_id uuid,p_question_id uuid,p_input_version integer,p_result jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare q public.questions;
begin
 if not exists(select 1 from public.profiles where id=p_user_id and role='admin' and status='active') then raise exception 'Access denied'; end if;
 select * into q from public.questions where id=p_question_id for update;
 if q.id is null or q.version<>p_input_version then raise exception 'Stale AI input version'; end if;
 if p_result->>'questionId' is distinct from q.id::text or p_result->>'inputVersion' is distinct from q.version::text or p_result->>'provider' not in('gemini','deepseek') or p_result->>'status' not in('clear','review','insufficient') or jsonb_typeof(p_result->'proposedAnswerIds') is distinct from 'array' or jsonb_typeof(p_result->'comments') is distinct from 'array' then raise exception 'Invalid AI result'; end if;
 insert into public.ai_checks(id,question_id,input_version,provider,model,data,created_at) values((p_result->>'id')::uuid,q.id,q.version,p_result->>'provider',p_result->>'model',p_result,(p_result->>'createdAt')::timestamptz);
 update public.questions set data=jsonb_set(data,'{aiCheck}',p_result,true) where id=q.id;
 return p_result;
end $$;
revoke all on function public.finish_ai_check(uuid,uuid,integer,jsonb) from public,anon,authenticated;
grant execute on function public.finish_ai_check(uuid,uuid,integer,jsonb) to service_role;
commit;
