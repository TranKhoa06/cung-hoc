import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { CheckError, SYSTEM, validateQuestion, needsMissingFigure, verifyWithOneModel } from './core.ts';
import type { Provider, ImageInput, ProviderReply } from './core.ts';

const env=(key:string)=>Deno.env.get(key)??'';
const defaults={gemini:env('GEMINI_MODEL')||'gemini-3.8-flash',deepseek:env('DEEPSEEK_MODEL')||'deepseek-flash'};
const allowedOrigins=[...env('ALLOWED_ORIGINS').split(','),env('APP_ORIGIN')].map(x=>x.trim()).filter(Boolean);
function defaultKey(name:string):string {try{const value=JSON.parse(env(name)||'{}').default;return typeof value==='string'?value:'';}catch{return '';}}
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const toBase64=(buffer:ArrayBuffer)=>{const bytes=new Uint8Array(buffer); let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);};

async function callModel(provider:Provider,model:string,prompt:string,images:ImageInput[]):Promise<ProviderReply> {
 const key=env(provider==='gemini'?'GEMINI_API_KEY':'DEEPSEEK_API_KEY');
 const url=provider==='gemini'?`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`:'https://api.deepseek.com/chat/completions';
 const body=provider==='gemini'?{
  systemInstruction:{parts:[{text:SYSTEM}]},
  contents:[{role:'user',parts:[{text:prompt},...images.map(image=>({inlineData:{mimeType:image.mime,data:image.base64}}))]}],
  generationConfig:{responseMimeType:'application/json',maxOutputTokens:8192}
 }:{model,messages:[{role:'system',content:SYSTEM},{role:'user',content:images.length?[{type:'text',text:prompt},...images.map(image=>({type:'image_url',image_url:{url:`data:${image.mime};base64,${image.base64}`}}))]:prompt}],response_format:{type:'json_object'},max_tokens:8192,stream:false};
 let response:Response;
 try {response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json',...(provider==='gemini'?{'x-goog-api-key':key}:{Authorization:`Bearer ${key}`})},body:JSON.stringify(body),signal:AbortSignal.timeout(45000)});}
 catch {throw new CheckError('AI_UNAVAILABLE','Dịch vụ AI không phản hồi hoặc hết thời gian. Không có kết luận đúng/sai; bạn có thể thử lại.',503);}
 if(!response.ok){const status=response.status;await response.body?.cancel();throw new CheckError('AI_REQUEST_FAILED',status===429?'API hết hạn mức hoặc đang giới hạn tốc độ. Hãy kiểm tra tài khoản và thử lại sau.':status===401||status===403?'API key chưa hợp lệ hoặc chưa được cấp quyền cho model đã chọn.':`Dịch vụ AI trả lỗi ${status}. Kiểm tra model và thử lại; câu chưa được kết luận.`,status===429?429:502);}
 let data:Record<string,any>;try{data=await response.json();}catch{throw new CheckError('AI_INVALID_RESPONSE','Dịch vụ AI trả dữ liệu không hợp lệ.',502);}
 if(provider==='gemini'){
  const candidate=data.candidates?.[0];
  if(candidate?.finishReason && candidate.finishReason!=='STOP')throw new CheckError('AI_INCOMPLETE','AI chưa hoàn tất kết quả (bị chặn hoặc hết độ dài). Không có kết luận.',502);
  return {text:(candidate?.content?.parts??[]).filter((p:any)=>typeof p.text==='string'&&!p.thought).map((p:any)=>p.text).join(''),usage:data.usageMetadata??{}};
 }
 const choice=data.choices?.[0];
 if(choice?.finish_reason &&choice.finish_reason!=='stop')throw new CheckError('AI_INCOMPLETE','AI chưa hoàn tất kết quả. Không có kết luận.',502);
 return {text:typeof choice?.message?.content==='string'?choice.message.content:'',usage:data.usage??{}};
}

Deno.serve(async request=>{
 const origin=request.headers.get('origin')??'';
 const cors={'Access-Control-Allow-Origin':allowedOrigins.length?(allowedOrigins.includes(origin)?origin:allowedOrigins[0]):'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(request.method!=='POST')return reply({error:'Chỉ hỗ trợ POST.'},405);
 if(allowedOrigins.length&&origin&&!allowedOrigins.includes(origin))return reply({error:'Origin không được phép.'},403);
 try{
  const authorization=request.headers.get('Authorization')??'';
  if(!/^Bearer\s+\S+$/i.test(authorization))throw new CheckError('UNAUTHENTICATED','Bạn cần đăng nhập.',401);
  const supabaseUrl=env('SUPABASE_URL'); const anonKey=env('SUPABASE_ANON_KEY')||env('SUPABASE_PUBLISHABLE_KEY')||defaultKey('SUPABASE_PUBLISHABLE_KEYS');
  const serviceKey=env('SUPABASE_SERVICE_ROLE_KEY')||defaultKey('SUPABASE_SECRET_KEYS');
  if(!supabaseUrl||!anonKey||!serviceKey)throw new CheckError('SERVER_CONFIG','Máy chủ chưa được cấu hình đầy đủ.',503);
  const userClient=createClient(supabaseUrl,anonKey,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false}});
  const {data:auth,error:authError}=await userClient.auth.getUser();
  if(authError||!auth.user)throw new CheckError('UNAUTHENTICATED','Phiên đăng nhập không hợp lệ. Hãy đăng nhập lại.',401);
  const service=createClient(supabaseUrl,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:profile,error:profileError}=await service.from('profiles').select('role,status').eq('id',auth.user.id).single();
  if(profileError||profile?.role!=='admin'||profile?.status!=='active')throw new CheckError('FORBIDDEN','Chỉ chủ dự án đang hoạt động được dùng kiểm tra AI.',403);
  const raw=await request.text();if(raw.length>3000)throw new CheckError('INVALID_REQUEST','Yêu cầu quá lớn.');
  let body:Record<string,unknown>;try{body=JSON.parse(raw);}catch{throw new CheckError('INVALID_REQUEST','Yêu cầu JSON không hợp lệ.');}
  if(!body||typeof body!=='object'||Array.isArray(body))throw new CheckError('INVALID_REQUEST','Yêu cầu không hợp lệ.');
  if(body.action==='status')return reply({gemini:!!env('GEMINI_API_KEY'),deepseek:!!env('DEEPSEEK_API_KEY'),models:defaults});
  if(body.provider!=='gemini'&&body.provider!=='deepseek')throw new CheckError('INVALID_PROVIDER','Chọn Gemini hoặc DeepSeek.');
  const provider=body.provider as Provider;
  if(!env(provider==='gemini'?'GEMINI_API_KEY':'DEEPSEEK_API_KEY'))throw new CheckError('MISSING_API_KEY','Bạn chưa gán API key của dịch vụ được chọn trong Supabase Secrets.',503);
  if(typeof body.questionId!=='string'||!UUID.test(body.questionId))throw new CheckError('INVALID_QUESTION','ID câu hỏi không hợp lệ.');
  const model=(typeof body.model==='string'&&body.model.trim()?body.model.trim():defaults[provider]).replace(/^models\//,'');
  if(model.length>100||!new RegExp(`^${provider==='gemini'?'gemini':'deepseek'}-[a-zA-Z0-9_.-]+$`).test(model))throw new CheckError('INVALID_MODEL','Tên model không hợp lệ cho dịch vụ đã chọn.');
  const {data:row,error:questionError}=await service.from('questions').select('id,deck_id,version,data').eq('id',body.questionId).single();
  if(questionError||!row)throw new CheckError('NOT_FOUND','Không tìm thấy câu hỏi đã lưu.',404);
  if(body.inputVersion!==undefined&&body.inputVersion!==row.version)throw new CheckError('STALE_INPUT','Nội dung đã thay đổi. Lưu lại rồi kiểm tra phiên bản mới.',409);
  const q=validateQuestion(row.data);
  if(q.id!==row.id||q.deckId!==row.deck_id||q.version!==row.version)throw new CheckError('INPUT_INCOMPLETE','Dữ liệu câu hỏi không khớp phiên bản trên máy chủ.');
  const {error:rateError}=await service.rpc('reserve_ai_job',{p_user_id:auth.user.id});
  if(rateError)throw new CheckError('RATE_LIMIT','Bạn đã kiểm tra nhiều câu liên tiếp. Chờ vài phút rồi tiếp tục.',429);
  const id=crypto.randomUUID();const createdAt=new Date().toISOString();
  let result:Record<string,unknown>;
  if(needsMissingFigure(q)){
   result={status:'insufficient',proposedAnswerIds:[],explanation:'',summary:'Đề nhắc tới hình/sơ đồ nhưng chưa gắn hình minh họa đã kiểm tra. Hãy bổ sung trước khi kiểm tra AI.',comments:q.opinions.map(o=>({opinionId:o.id,answerStatus:'uncertain',explanationStatus:o.explanation?'uncertain':'absent',reason:'Chưa đủ hình/dữ kiện để đối chiếu.'}))};
  }else{
   const images:ImageInput[]=[];let totalBytes=0;
   if(q.questionImageIds.length){
    const visionModels=(env(provider==='gemini'?'GEMINI_VISION_MODELS':'DEEPSEEK_VISION_MODELS')||(provider==='gemini'?`${defaults.gemini},gemini-3.8-flash,gemini-2.5-flash`:'deepseek-flash')).split(',').map(x=>x.trim());
    if(!visionModels.includes(model))throw new CheckError('MODEL_NO_VISION','Model này chưa được cấu hình hỗ trợ ảnh. Chọn model hỗ trợ ảnh hoặc cấu hình VISION_MODELS trên máy chủ.');
    const {data:sources,error:sourceError}=await service.from('sources').select('id,deck_id,data,storage_path').in('id',q.questionImageIds);
    if(sourceError||sources?.length!==q.questionImageIds.length)throw new CheckError('MISSING_IMAGE','Không tìm thấy đủ ảnh minh họa cần thiết.');
    for(const source of sources??[]){
     if(source.deck_id!==q.deckId||source.data?.kind!=='question'||!source.storage_path||!source.storage_path.startsWith(source.id+'/'))throw new CheckError('INVALID_IMAGE','Chỉ gửi ảnh đề/hình cắt thuộc câu hỏi; không gửi ảnh bình luận trong lượt giải.');
     const {data:blob,error:downloadError}=await service.storage.from('source-images').download(source.storage_path);
     if(downloadError||!blob)throw new CheckError('MISSING_IMAGE','Chưa tải được ảnh minh họa. Hãy lưu ảnh rồi thử lại.');
     totalBytes+=blob.size;
     if(blob.size>4*1024*1024||totalBytes>8*1024*1024)throw new CheckError('IMAGE_TOO_LARGE','Ảnh gửi AI quá lớn. Hãy cắt phần đề/hình cần thiết và giảm dung lượng (tối đa 4MB/ảnh, 8MB tổng mỗi câu).');
     const mime=blob.type||source.data.mime;
     if(!['image/jpeg','image/png','image/webp'].includes(mime))throw new CheckError('INVALID_IMAGE','Định dạng ảnh chưa được hỗ trợ.');
     images.push({mime,base64:toBase64(await blob.arrayBuffer())});
    }
   }
   result=await verifyWithOneModel(q,provider,model,images,callModel);
  }
  const check={id,questionId:q.id,inputVersion:q.version,provider,model,createdAt,...result};
  const {data:saved,error:saveError}=await service.rpc('finish_ai_check',{p_user_id:auth.user.id,p_question_id:q.id,p_input_version:q.version,p_result:check});
  if(saveError)throw new CheckError('STALE_OR_FORBIDDEN','Câu hỏi hoặc quyền quản trị đã thay đổi trong lúc AI xử lý. Kết quả chưa được áp dụng; hãy tải lại.',409);
  return reply(saved??check);
 }catch(error){
  if(error instanceof CheckError)return reply({error:error.message,code:error.code},error.status);
  // Never include provider response, headers, secret or raw unexpected error in client responses/logs.
  return reply({error:'Kiểm tra AI chưa hoàn tất. Hãy kiểm tra cấu hình hoặc thử lại.',code:'INTERNAL_ERROR'},500);
 }
});
