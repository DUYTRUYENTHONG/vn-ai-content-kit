import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewHookDirection} from '../src/hooks.mjs';

const direction=()=>({schemaVersion:1,
  script:'Có khách sắp ghé nhà chơi? Mình dọn chỗ ngồi trước đã. Rồi cất đồ đang vướng lối đi.',
  hook:'Có khách sắp ghé nhà chơi?',mechanism:'specific-situation',
  focusPhrase:'sắp ghé',pauseAfterPhrase:'nhà chơi?',payoffPhrase:'dọn chỗ ngồi trước',
  buyerConcern:'Không biết bắt đầu dọn ở đâu.',reasonToContinue:'Chọn một việc ưu tiên thay vì ôm hết việc.',
  direction:'Nhấn nhẹ vào sắp ghé, giữ ngữ điệu hỏi rồi nghỉ tự nhiên trước câu trả lời.',
  sourceRefs:['fixture:editorial-hypothesis']});

test('direction preserves speech and cannot grant acoustic or training acceptance',()=>{
  const input=direction(),r=reviewHookDirection(input);
  assert.equal(r.script,input.script);assert.equal(r.focusPhrase,'sắp ghé');assert.equal(r.consistencyChecked,true);
  for(const key of ['deliveryVerified','claimsVerified','listeningApproved','publicationReady','trainingReady','providerControlApplied'])assert.equal(r[key],false);
  assert.deepEqual(reviewHookDirection({...input,script:input.script.normalize('NFD')}),r);
});

test('rejects detached hooks, stale script hashes, ambiguous focus and missing payoff',()=>{
  for(const change of [{hook:'Khách sắp tới?'},{scriptSha256:'0'.repeat(64)},
    {focusPhrase:'mua ngay'},{hook:'Có khách sắp ghé nhà chơi? Có khách sắp ghé nhà chơi?',script:'Có khách sắp ghé nhà chơi? Có khách sắp ghé nhà chơi? Rồi dọn chỗ ngồi trước.'},
    {pauseAfterPhrase:'mua ngay'},{payoffPhrase:'đánh bay mọi vết bẩn'},{sourceRefs:[]},
    {mechanism:'guaranteed-viral'},{reasonToContinue:''}])assert.throws(()=>reviewHookDirection({...direction(),...change}));
});
