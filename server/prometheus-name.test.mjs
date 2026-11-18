import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseShopAction} from './shop.mjs';
test('Prometheus naming requires a request UUID and a normalized, bounded personal name',()=>{
  const requestId='a1111111-1111-4111-8111-111111111111';
  assert.deepEqual(parseShopAction('POST',{action:'name_prometheus',name:'  Lửa  ',requestId}),
    {action:'name_prometheus',data:{name:'Lửa'},reference:requestId});
  for(const name of ['', ' ', 'x'.repeat(33),'a\n','a\u200b',null]){
    if(name==='a\n')continue; // Trailing whitespace is trimmed, matching Champion.
    assert.equal(parseShopAction('POST',{action:'name_prometheus',name,requestId}),undefined);
  }
  assert.equal(parseShopAction('POST',{action:'name_prometheus',name:'Test'}),undefined);
  assert.equal(parseShopAction('POST',{action:'name_prometheus',name:'a\nb',requestId}),undefined);
});
