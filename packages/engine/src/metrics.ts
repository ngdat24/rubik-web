import { parseMove } from './parser.js';
import type { ParsedMove } from './types.js';

/**
 * Tính số nước HTM/OBTM của một nước đi đơn lẻ:
 * - Xoay toàn khối (1..N): 0
 * - Chứa lớp ngoài (layerStart === 1 hoặc layerEnd === N): 1
 * - Chỉ chứa lớp trong: 2
 */
export function moveHtmCost(move: ParsedMove, size: number): number {
  if (move.layerStart === 1 && move.layerEnd === size) {
    return 0;
  }
  if (move.layerStart === 1 || move.layerEnd === size) {
    return 1;
  }
  return 2;
}

export function countPressMoves(moves: readonly (string | ParsedMove)[], size: number = 3): number {
  let total = 0;
  for (const m of moves) {
    const parsed = typeof m === 'string' ? parseMove(m, size) : m;
    total += moveHtmCost(parsed, size);
  }
  return total;
}

/**
 * Rút gọn các nước liên tiếp có cùng trục và cùng dải lớp (x, y, z là rào cản),
 * sau đó tính tổng HTM của chuỗi rút gọn.
 */
export function countSolutionLength(moves: readonly (string | ParsedMove)[], size: number = 3): number {
  const stack: { axis: string; start: number; end: number; turns: number; isRotation: boolean; sample: ParsedMove }[] = [];

  for (const m of moves) {
    const parsed = typeof m === 'string' ? parseMove(m, size) : m;
    const isRotation = parsed.type === 'rotation';
    const turnVal = parsed.quarterTurns === 2 ? 2 : parsed.quarterTurns === 1 ? 1 : 3;

    if (isRotation) {
      stack.push({
        axis: parsed.axis,
        start: parsed.layerStart,
        end: parsed.layerEnd,
        turns: turnVal,
        isRotation: true,
        sample: parsed,
      });
      continue;
    }

    const top = stack[stack.length - 1];
    if (top && !top.isRotation && top.axis === parsed.axis && top.start === parsed.layerStart && top.end === parsed.layerEnd) {
      top.turns = (top.turns + turnVal) % 4;
      if (top.turns === 0) {
        stack.pop();
      }
    } else {
      stack.push({
        axis: parsed.axis,
        start: parsed.layerStart,
        end: parsed.layerEnd,
        turns: turnVal,
        isRotation: false,
        sample: parsed,
      });
    }
  }

  let length = 0;
  for (const item of stack) {
    if (!item.isRotation && item.turns !== 0) {
      length += moveHtmCost(item.sample, size);
    }
  }
  return length;
}

export function tps(pressCount: number, timeMs: number): number {
  if (!Number.isInteger(pressCount) || pressCount < 0 || !Number.isSafeInteger(timeMs) || timeMs < 0) {
    throw new RangeError('TPS requires nonnegative integer counts and milliseconds');
  }
  return timeMs === 0 ? 0 : pressCount * 1000 / timeMs;
}

/** Canonical reduced sequence; never combine across whole-cube rotations. */
export function simplify(moves: readonly (string | ParsedMove)[], size: number = 3): string[] {
  const stack: ParsedMove[] = [];
  for (const input of moves) {
    const move = parseMove(typeof input === 'string' ? input : input.canonical, size);
    const top = stack[stack.length - 1];
    if (top && top.type !== 'rotation' && move.type !== 'rotation' && top.axis === move.axis
      && top.layerStart === move.layerStart && top.layerEnd === move.layerEnd) {
      const turns = ((top.quarterTurns + move.quarterTurns) % 4 + 4) % 4;
      stack.pop();
      if (turns !== 0) {
        const body = top.canonical.replace(/['2]$/, '');
        const base = parseMove(body, size);
        const suffix = turns === 2 ? '2' : turns === ((base.quarterTurns + 4) % 4) ? '' : "'";
        stack.push(parseMove(body + suffix, size));
      }
    } else stack.push(move);
  }
  return stack.map(move => move.canonical);
}
