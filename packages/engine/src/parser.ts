import type { Axis, ParsedMove } from './types.js';

const TOKEN_REGEX = /^(\d+)?([UDLRFBudlrfbMESxyz])(w)?(['’‘23]+)?$/;

export class MoveParseError extends Error {
  /** Reference-vector error category; reason retains the detailed diagnostic. */
  get code(): string {
    if (this.reason === 'slice_on_non_3x3') return 'SLICE_ONLY_3X3';
    if (this.reason === 'wide_on_2x2' || this.reason === 'wide_out_of_range') return 'WIDE_RANGE';
    if (this.reason === 'inner_layer_on_2x2' || this.reason === 'layer_out_of_range') return 'LAYER_RANGE';
    return 'BAD_TOKEN';
  }
  constructor(
    message: string,
    public readonly token: string,
    public readonly reason: string
  ) {
    super(message);
    this.name = 'MoveParseError';
  }
}

export function parseMove(rawToken: string, size: number = 3): ParsedMove {
  if (size < 2 || size > 10 || !Number.isInteger(size)) {
    throw new MoveParseError(`Invalid cube size: ${size}`, rawToken, 'invalid_size');
  }

  if (/[()]/.test(rawToken)) {
    throw new MoveParseError(`Brackets are not supported: ${rawToken}`, rawToken, 'brackets_not_supported');
  }

  const match = rawToken.match(TOKEN_REGEX);
  if (!match) {
    const reason = /^[UDLRFBudlrfbMESxyz]{2,}$/.test(rawToken) ? 'missing_space' : 'invalid_syntax';
    throw new MoveParseError(`Invalid move token: "${rawToken}"`, rawToken, reason);
  }

  const numStr = match[1]; const symbol = match[2]!; const wFlag = match[3]; const rawSuffix = match[4];

  // Kiểm tra hậu tố góc quay
  let suffix = '';
  let cwTurns = 1; // 1 = 90° CW nhìn từ mặt đó, -1 = 90° CCW, 2 = 180°
  if (rawSuffix) {
    const normalizedSuffix = rawSuffix.replace(/[’‘]/g, "'");
    if (normalizedSuffix === "'") {
      suffix = "'";
      cwTurns = -1;
    } else if (normalizedSuffix === '2' || normalizedSuffix === "2'") {
      suffix = '2';
      cwTurns = 2;
    } else {
      throw new MoveParseError(`Invalid suffix in "${rawToken}"`, rawToken, 'invalid_suffix');
    }
  }

  // 1. Xử lý nước xoay toàn khối (x, y, z)
  if (symbol === 'x' || symbol === 'y' || symbol === 'z') {
    if (numStr || wFlag) {
      throw new MoveParseError(`Rotation cannot have layer count or 'w': "${rawToken}"`, rawToken, 'invalid_rotation');
    }
    const axis = symbol as Axis;
    return {
      raw: rawToken,
      canonical: `${symbol}${suffix}`,
      type: 'rotation',
      axis,
      layerStart: 1,
      layerEnd: size,
      quarterTurns: toAxisQuarterTurns(cwTurns, -1),
    };
  }

  // 2. Xử lý nước Slice (M, E, S)
  if (symbol === 'M' || symbol === 'E' || symbol === 'S') {
    if (numStr || wFlag) {
      throw new MoveParseError(`Slice move cannot have layer count or 'w': "${rawToken}"`, rawToken, 'invalid_slice');
    }
    if (size !== 3) {
      throw new MoveParseError(`Slice move "${rawToken}" is only valid on 3x3`, rawToken, 'slice_on_non_3x3');
    }
    const axis: Axis = symbol === 'M' ? 'x' : symbol === 'E' ? 'y' : 'z';
    // M theo L (+90°), E theo D (+90°), S theo F (-90°)
    const baseSign = symbol === 'S' ? -1 : 1;
    return {
      raw: rawToken,
      canonical: `${symbol}${suffix}`,
      type: 'slice',
      axis,
      layerStart: 2,
      layerEnd: 2,
      quarterTurns: toAxisQuarterTurns(cwTurns, baseSign),
    };
  }

  // 3. Xử lý chữ thường (r, u, f, d, l, b) -> tương đương 2Rw
  const isLower = symbol >= 'a' && symbol <= 'z';
  if (isLower && (numStr || wFlag)) {
    throw new MoveParseError(`Lowercase move cannot combine with number or 'w': "${rawToken}"`, rawToken, 'lowercase_with_number');
  }

  const faceChar = symbol.toUpperCase() as 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
  const isWide = Boolean(wFlag) || isLower;

  if (isWide) {
    if (size === 2) {
      throw new MoveParseError(`Wide moves are not allowed on 2x2: "${rawToken}"`, rawToken, 'wide_on_2x2');
    }
    const width = numStr ? parseInt(numStr, 10) : 2;
    if (width < 2 || width > size - 1) {
      throw new MoveParseError(`Wide width ${width} out of range for ${size}x${size}`, rawToken, 'wide_out_of_range');
    }
    const prefix = width === 2 ? '' : String(width);
    const { axis, layerStart, layerEnd, baseSign } = mapFaceLayers(faceChar, 1, width, size);
    return {
      raw: rawToken,
      canonical: `${prefix}${faceChar}w${suffix}`,
      type: 'wide',
      axis,
      layerStart,
      layerEnd,
      quarterTurns: toAxisQuarterTurns(cwTurns, baseSign),
    };
  }

  // 4. Xử lý nước mặt đơn hoặc lớp thứ n (R, 2R...)
  const layer = numStr ? parseInt(numStr, 10) : 1;
  if (size === 2 && layer !== 1) {
    throw new MoveParseError(`Inner layer move not allowed on 2x2: "${rawToken}"`, rawToken, 'inner_layer_on_2x2');
  }
  if (layer < 1 || layer > size) {
    throw new MoveParseError(`Layer ${layer} out of range for ${size}x${size}`, rawToken, 'layer_out_of_range');
  }

  const prefix = layer === 1 ? '' : String(layer);
  const { axis, layerStart, layerEnd, baseSign } = mapFaceLayers(faceChar, layer, layer, size);
  return {
    raw: rawToken,
    canonical: `${prefix}${faceChar}${suffix}`,
    type: 'face',
    axis,
    layerStart,
    layerEnd,
    quarterTurns: toAxisQuarterTurns(cwTurns, baseSign),
  };
}

export function parseMoves(sequence: string, size: number = 3): ParsedMove[] {
  if (!Number.isInteger(size) || size < 2 || size > 10) {
    throw new MoveParseError(`Invalid cube size: ${size}`, sequence, 'invalid_size');
  }
  const trimmed = sequence.trim();
  if (!trimmed) return [];
  const tokens = trimmed.split(/\s+/);
  return tokens.map((t) => parseMove(t, size));
}

function toAxisQuarterTurns(cwTurns: number, baseSign: 1 | -1): -1 | 1 | 2 {
  if (cwTurns === 2) return 2;
  return (cwTurns * baseSign) as -1 | 1;
}

/**
 * Quy đổi khoảng lớp [from..to] đếm từ mặt faceChar sang chỉ số lớp [1..size]
 * tính từ mặt dương (+x = R, +y = U, +z = F).
 */
function mapFaceLayers(
  face: 'U' | 'D' | 'L' | 'R' | 'F' | 'B',
  from: number,
  to: number,
  size: number
): { axis: Axis; layerStart: number; layerEnd: number; baseSign: 1 | -1 } {
  switch (face) {
    case 'R':
      return { axis: 'x', layerStart: from, layerEnd: to, baseSign: -1 };
    case 'L':
      return { axis: 'x', layerStart: size - to + 1, layerEnd: size - from + 1, baseSign: 1 };
    case 'U':
      return { axis: 'y', layerStart: from, layerEnd: to, baseSign: -1 };
    case 'D':
      return { axis: 'y', layerStart: size - to + 1, layerEnd: size - from + 1, baseSign: 1 };
    case 'F':
      return { axis: 'z', layerStart: from, layerEnd: to, baseSign: -1 };
    case 'B':
      return { axis: 'z', layerStart: size - to + 1, layerEnd: size - from + 1, baseSign: 1 };
  }
}
