/**
 * 输入：Pointer Events（鼠标 + 触控统一），把屏幕坐标映射到 1280×720 逻辑空间。
 * - canvas 上的 touch-action: none（CSS）阻止手势滚动；这里再挂非被动 touchmove
 *   preventDefault 兜底 iOS 滚动穿透，保证移动端滑切不滚页面。
 * - 监听挂在 window 上，刀路拖出画布外仍能继续。
 */

export interface PointerCoords {
  x: number;
  y: number;
}

export interface PointerHandlers {
  onDown: (p: PointerCoords) => void;
  onMove: (p: PointerCoords) => void;
  onUp: (p: PointerCoords) => void;
}

/** 返回清理函数 */
export function attachInput(
  canvas: HTMLCanvasElement,
  map: (clientX: number, clientY: number) => PointerCoords,
  handlers: PointerHandlers
): () => void {
  let activePointerId: number | null = null;

  const handleDown = (e: PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    activePointerId = e.pointerId;
    try {
      canvas.setPointerCapture?.(e.pointerId);
    } catch {
      /* 某些浏览器不支持 pointer capture */
    }
    handlers.onDown(map(e.clientX, e.clientY));
  };

  const handleMove = (e: PointerEvent) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    if (e.pointerType === "mouse" && e.buttons === 0) return; // 鼠标未按下不产生刀路
    handlers.onMove(map(e.clientX, e.clientY));
  };

  const handleUp = (e: PointerEvent) => {
    if (activePointerId !== null && e.pointerId !== activePointerId) return;
    activePointerId = null;
    handlers.onUp(map(e.clientX, e.clientY));
  };

  const blockTouchScroll = (e: TouchEvent) => {
    if (e.cancelable) e.preventDefault();
  };

  canvas.addEventListener("pointerdown", handleDown);
  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
  window.addEventListener("pointercancel", handleUp);
  canvas.addEventListener("touchmove", blockTouchScroll, { passive: false });

  return () => {
    canvas.removeEventListener("pointerdown", handleDown);
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleUp);
    canvas.removeEventListener("touchmove", blockTouchScroll);
  };
}
