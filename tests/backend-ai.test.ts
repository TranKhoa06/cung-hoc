import { describe, it, expect } from 'vitest';
import { solvePrompt, comparePrompt, parseSolve, parseComparison, parseModelJson, validateQuestion, verifyWithOneModel, needsMissingFigure } from '../supabase/functions/verify-answer/core';
import type { InputQuestion, Caller } from '../supabase/functions/verify-answer/core';
const question:InputQuestion={id:'q1',deckId:'d1',version:2,prompt:'Chọn các số chẵn.',kind:'multiple',choices:[{id:'a',label:'A',text:'2'},{id:'b',label:'B',text:'3'},{id:'c',label:'C',text:'4'},{id:'d',label:'D',text:'5'},{id:'e',label:'E',text:'7'}],questionImageIds:[],opinions:[{id:'opinion1',text:'Tôi chọn B. SECRET_COMMENT',answerIds:['b'],explanation:'3 chia hết cho 2.'}]};
const solved={status:'solved',answerIds:['a','c'],explanation:'2 và 4 chia hết cho 2.',missing:''};
const compared={status:'review',summary:'Ý kiến nguồn cần xem lại.',comments:[{opinionId:'opinion1',answerStatus:'suspect',explanationStatus:'suspect',reason:'3 không chia hết cho 2.'}]};
describe('backend AI boundary and validation',()=>{
 it('first solve contains only the question, never candidate answer, comment or prior explanation',()=>{const prompt=solvePrompt({...question,correctIds:['b'],explanation:'SECRET_EXPLANATION',aiCheck:{summary:'SECRET_AI'}} as InputQuestion);expect(prompt).not.toContain('SECRET_COMMENT');expect(prompt).not.toContain('SECRET_EXPLANATION');expect(prompt).not.toContain('SECRET_AI');expect(prompt).toContain('Chọn các số chẵn.');expect(prompt).toContain('"id":"e"');});
 it('uses exactly the same provider/model for both requests, no fallback',async()=>{const calls:{provider:string;model:string;prompt:string}[]=[];const call:Caller=async(provider,model,prompt)=>{calls.push({provider,model,prompt});return{text:JSON.stringify(calls.length===1?solved:compared),usage:{}};};const result=await verifyWithOneModel(question,'gemini','gemini-test',[],call);expect(calls).toHaveLength(2);expect(calls.every(c=>c.provider==='gemini'&&c.model==='gemini-test')).toBe(true);expect(calls[0].prompt).not.toContain('SECRET_COMMENT');expect(calls[1].prompt).toContain('SECRET_COMMENT');expect(result.proposedAnswerIds).toEqual(['a','c']);expect(result.status).toBe('review');});
 it('does not call another model when provider throws',async()=>{let count=0;await expect(verifyWithOneModel(question,'deepseek','deepseek-test',[],async()=>{count++;throw new Error('API unavailable');})).rejects.toThrow('API unavailable');expect(count).toBe(1);});
 it('rejects IDs not present in dynamic choices and duplicate IDs',()=>{expect(()=>parseSolve({...solved,answerIds:['missing']},question)).toThrow();expect(()=>parseSolve({...solved,answerIds:['a','a']},question)).toThrow();expect(()=>parseSolve(solved,{...question,kind:'single'})).toThrow();});
 it('requires one separate answer and explanation assessment for every source opinion',()=>{expect(()=>parseComparison({...compared,comments:[]},question,parseSolve(solved,question))).toThrow();expect(()=>parseComparison({...compared,comments:[...compared.comments,...compared.comments]},question,parseSolve(solved,question))).toThrow();const result=parseComparison({...compared,status:'clear',comments:[{...compared.comments[0],answerStatus:'agree',explanationStatus:'suspect'}]},question,parseSolve(solved,question));expect(result.status).toBe('review');});
 it('keeps insufficient evidence insufficient regardless of model comparison assertion',()=>{const result=parseComparison({...compared,status:'clear'},question,{status:'insufficient',answerIds:[],explanation:'',missing:'Thiếu hình'});expect(result.status).toBe('insufficient');});
 it('rejects truncated/empty JSON and incomplete source input',()=>{expect(()=>parseModelJson('')).toThrow();expect(()=>parseModelJson('{"status":')).toThrow();expect(()=>validateQuestion({...question,choices:[question.choices[0],question.choices[0]]})).toThrow();expect(validateQuestion(question).choices).toHaveLength(5);});
 it('flags missing required diagrams without guessing answers',()=>{expect(needsMissingFigure({...question,prompt:'Theo sơ đồ bên dưới, chọn đáp án đúng.'})).toBe(true);expect(needsMissingFigure({...question,prompt:'For the circuit shown below, choose the correct value.'})).toBe(true);expect(needsMissingFigure({...question,prompt:'Theo hình bên dưới',questionImageIds:['source1']})).toBe(false);});
 it('compares an existing draft key and explanation only in the second pass',()=>{
  const q={...question,opinions:[],correctIds:['b'],explanation:'DRAFT_SECRET_REASON'};
  expect(solvePrompt(q)).not.toContain('DRAFT_SECRET_REASON');expect(comparePrompt(q,parseSolve(solved,q))).toContain('DRAFT_SECRET_REASON');
  const result=parseComparison({status:'clear',summary:'Không sao.',comments:[],draftAssessment:{answerStatus:'agree',explanationStatus:'agree',reason:'Model đồng ý.'}},q,parseSolve(solved,q));
  expect(result.status).toBe('review');expect(result.draftAssessment?.answerStatus).toBe('suspect');
 });
 it('rejects missing assessment when draft answer or explanation exists',()=>{
  const q={...question,opinions:[],correctIds:['a','c'],explanation:'A draft explanation'};
  expect(()=>parseComparison({status:'clear',summary:'OK',comments:[]},q,parseSolve(solved,q))).toThrow();
 });
 it('forces explicit opinion answer mismatch to review even if model asserts agreement',()=>{
  const result=parseComparison({status:'clear',summary:'OK',comments:[{opinionId:'opinion1',answerStatus:'agree',explanationStatus:'agree',reason:'OK'}]},question,parseSolve(solved,question));
  expect(result.status).toBe('review');expect(result.comments[0].answerStatus).toBe('suspect');
 });

});
