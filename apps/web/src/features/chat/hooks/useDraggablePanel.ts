'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

interface PanelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface UseDraggablePanelReturn {
  panelRect: PanelRect;
  isDragging: boolean;
  isResizing: boolean;
  handleDragPointerDown: (e: React.PointerEvent) => void;
  handleResizePointerDown: (e: React.PointerEvent) => void;
}

const MIN_WIDTH = 280;
const MIN_HEIGHT = 300;
const DEFAULT_WIDTH = 350;
const DEFAULT_HEIGHT = 400;
const STORAGE_KEY = 'chat_panel_rect';

function getDefaultRect(): PanelRect {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
  return {
    x: window.innerWidth - DEFAULT_WIDTH - 24,
    y: window.innerHeight - DEFAULT_HEIGHT - 80,
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  };
}

function clampToViewport(rect: PanelRect): PanelRect {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(Math.max(rect.width, MIN_WIDTH), vw);
  const h = Math.min(Math.max(rect.height, MIN_HEIGHT), vh);
  const x = Math.min(Math.max(rect.x, 0), vw - w);
  const y = Math.min(Math.max(rect.y, 0), vh - h);
  return { x, y, width: w, height: h };
}

function loadFromStorage(): PanelRect {
  if (typeof window === 'undefined') return getDefaultRect();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PanelRect;
      return clampToViewport(parsed);
    }
  } catch {
    /* ignore */
  }
  return getDefaultRect();
}

function saveToStorage(rect: PanelRect): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rect));
}

export function useDraggablePanel(isOpen: boolean): UseDraggablePanelReturn {
  const [panelRect, setPanelRect] = useState<PanelRect>(getDefaultRect);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);

  const rectRef = useRef<PanelRect>(panelRect);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startX: number;
    startY: number;
  } | null>(null);
  const resizeStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    startW: number;
    startH: number;
  } | null>(null);
  const rafRef = useRef<number>(0);

  // Load persisted rect on mount
  useEffect(() => {
    const loaded = loadFromStorage();
    rectRef.current = loaded;
    setPanelRect(loaded);
  }, []);

  // Re-clamp when panel re-opens
  const prevOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      const clamped = clampToViewport(rectRef.current);
      rectRef.current = clamped;
      setPanelRect(clamped);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  // Re-clamp on window resize
  useEffect(() => {
    const onResize = () => {
      const clamped = clampToViewport(rectRef.current);
      rectRef.current = clamped;
      setPanelRect(clamped);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Body styles during drag/resize
  useEffect(() => {
    if (isDragging || isResizing) {
      document.body.style.userSelect = 'none';
      document.body.style.cursor = isDragging ? 'grabbing' : 'nwse-resize';
    } else {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    }
    return () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isDragging, isResizing]);

  const handleDragPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: rectRef.current.x,
      startY: rectRef.current.y,
    };
    setIsDragging(true);

    const onMove = (ev: PointerEvent) => {
      if (!dragStartRef.current) return;
      const dx = ev.clientX - dragStartRef.current.pointerX;
      const dy = ev.clientY - dragStartRef.current.pointerY;
      const newX = Math.min(
        Math.max(dragStartRef.current.startX + dx, 0),
        window.innerWidth - rectRef.current.width,
      );
      const newY = Math.min(
        Math.max(dragStartRef.current.startY + dy, 0),
        window.innerHeight - rectRef.current.height,
      );

      rectRef.current = { ...rectRef.current, x: newX, y: newY };

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setPanelRect({ ...rectRef.current });
      });
    };

    const onUp = () => {
      dragStartRef.current = null;
      setIsDragging(false);
      saveToStorage(rectRef.current);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, []);

  const handleResizePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    resizeStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startW: rectRef.current.width,
      startH: rectRef.current.height,
    };
    setIsResizing(true);

    const onMove = (ev: PointerEvent) => {
      if (!resizeStartRef.current) return;
      const dx = ev.clientX - resizeStartRef.current.pointerX;
      const dy = ev.clientY - resizeStartRef.current.pointerY;

      const maxW = window.innerWidth - rectRef.current.x;
      const maxH = window.innerHeight - rectRef.current.y;

      const newW = Math.min(Math.max(resizeStartRef.current.startW + dx, MIN_WIDTH), maxW);
      const newH = Math.min(Math.max(resizeStartRef.current.startH + dy, MIN_HEIGHT), maxH);

      rectRef.current = { ...rectRef.current, width: newW, height: newH };

      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setPanelRect({ ...rectRef.current });
      });
    };

    const onUp = () => {
      resizeStartRef.current = null;
      setIsResizing(false);
      saveToStorage(rectRef.current);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  }, []);

  return {
    panelRect,
    isDragging,
    isResizing,
    handleDragPointerDown,
    handleResizePointerDown,
  };
}
