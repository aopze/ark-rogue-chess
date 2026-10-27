// P0.1-3 自测样例（非产品代码）：第二个模块，用于验证清单顺序与 import/export 剥离。
import { FIRST_MODULE_MARKER } from './01-first.js';

export function secondUsesFirst() {
  return FIRST_MODULE_MARKER;
}

const SECOND_MODULE_MARKER = true;
