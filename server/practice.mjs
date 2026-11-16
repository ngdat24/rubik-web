import {randomBytes,randomUUID} from 'node:crypto';
import {verifySolve} from './verify-solve.mjs';
import {countPressMoves} from '../packages/engine/dist/index.js';

const minimum = new Map([[2,[6,1500]],[3,[14,3500]],[4,[35,15000]],[5,[55,35000]]]);

export function practiceEligibility(solve) {
  const [turnThreshold,timeThreshold] = minimum.get(Math.min(5,solve.size));
  const moves = countPressMoves(solve.events.map(event=>event.m),solve.size);
  return {moves,effectiveMs:solve.timeMs+(solve.penalty==='+2'?2000:0),
    eligible:solve.size<=5 && solve.penalty!=='DNF' && moves>=turnThreshold && solve.timeMs>=timeThreshold};
}

const challengeId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function preparePracticeAction(body) {
  if (body.action === 'issue') {
    if (!Number.isInteger(body.size) || body.size < 2 || body.size > 10) {
      throw new Error('Kích thước luyện tập không hợp lệ.');
    }
    return {
      method:'issue',
      input:{p_id:randomUUID(),p_seed:randomBytes(32).toString('hex'),p_size:body.size}
    };
  }
  if (body.action !== 'finish' || typeof body.challengeId !== 'string' || !challengeId.test(body.challengeId)) {
    throw new Error('Phiên luyện tập không hợp lệ.');
  }
  const solve = verifySolve(body.solve);
  if (solve.scrambleIndex !== 0 || solve.scrambleSource !== 'generated' || solve.penalty === 'DNF') {
    throw new Error('Lượt giải này không đủ điều kiện xác minh.');
  }
  const {moves,effectiveMs,eligible}=practiceEligibility(solve);
  return {method:'finish',input:{p_id:body.challengeId,p_solve:solve,p_moves:moves,
    p_effective_ms:effectiveMs,p_eligible:eligible}};
}

export const practiceErrorMessages = {
  profile_required:'Đặt tên hồ sơ trước khi lấy scramble máy chủ.',
  challenge_mismatch:'Lượt giải không khớp scramble đã cấp.',
  challenge_used:'Scramble hoặc lượt giải đã được ghi nhận.'
};
