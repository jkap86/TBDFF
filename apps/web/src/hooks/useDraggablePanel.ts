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
  isMaximized: boolean;
  toggleMaximize: () => void;
  handleDragPointerDown: (e: React.PointerEvent) => void;
  handleResizePointerDown: (e: React.PointerEvent) => void;
}

export interface DraggablePanelOptions {
  storageKey: string;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
  defaultAnchor?: 'bottom-left' | 'bottom-right';
  defaultOffsetX?: number;
  defaultOffsetY?: number;
}

const MAXIMIZED_PADDING = 8;

function getMaximizedRect(): PanelRect {
  if (typeof window === 'undefined') {
    return { x: 0, y: 0, width: 800, height: 600 };
  }
  return {
    x: MAXIMIZED_PADDING,
    y: MAXIMIZED_PADDING,
    width: window.innerWidth - MAXIMIZED_PADDING * 2,
    height: window.innerHeight - MAXIMIZED_PADDING * 2,
  };
}

export function useDraggablePanel(
  isOpen: boolean,
  options: DraggablePanelOptions,
): UseDraggablePanelReturn {
  const {
    storageKey,
    defaultWidth = 350,
    defaultHeight = 400,
    minWidth = 280,
    minHeight = 300,
    defaultAnchor = 'bottom-right',
    defaultOffsetX = 24,
    defaultOffsetY = 80,
  } = options;

  const getDefaultRect = useCallback((): PanelRect => {
    if (typeof window === 'undefined') {
      return { x: 0, y: 0, width: defaultWidth, height: defaultHeight };
    }
    const x =
      defaultAnchor === 'bottom-left'
        ? defaultOffsetX
        : window.innerWidth - defaultWidth - defaultOffsetX;
    return {
      x,
      y: window.innerHeight - defaultHeight - defaultOffsetY,
      width: defaultWidth,
      height: defaultHeight,
    };
  }, [defaultWidth, defaultHeight, defaultAnchor, defaultOffsetX, defaultOffsetY]);

  const clampToViewport = useCallback(
    (rect: PanelRect): PanelRect => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const w = Math.min(Math.max(rect.width, minWidth), vw);
      const h = Math.min(Math.max(rect.height, minHeight), vh);
      const x = Math.min(Math.max(rect.x, 0), vw - w);
      const y = Math.min(Math.max(rect.y, 0), vh - h);
      return { x, y, width: w, height: h };
    },
    [minWidth, minHeight],
  );

  const loadFromStorage = useCallback((): PanelRect => {
    if (typeof window === 'undefined') return getDefaultRect();
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as PanelRect;
        return clampToViewport(parsed);
      }
    } catch {
      /* ignore */
    }
    return getDefaultRect();
  }, [storageKey, clampToViewport, getDefaultRect]);

  const saveToStorage = useCallback(
    (rect: PanelRect): void => {
      if (typeof window === 'undefined') return;
      localStorage.setItem(storageKey, JSON.stringify(rect));
    },
    [storageKey],
  );

  const [panelRect, setPanelRect] = useState<PanelRect>(getDefaultRect);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  const rectRef = useRef<PanelRect>(panelRect);
  const preMaxRectRef = useRef<PanelRect | null>(null);
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
  }, [loadFromStorage]);

  // Re-clamp when panel re-opens
  const prevOpenRef = useRef(isOpen);
  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      const clamped = clampToViewport(rectRef.current);
      rectRef.current = clamped;
      setPanelRect(clamped);
    }
    prevOpenRef.current = isOpen;
  }, [isOpen, clampToViewport]);

  // Re-clamp on window resize
  useEffect(() => {
    const onResize = () => {
      const clamped = clampToViewport(rectRef.current);
      rectRef.current = clamped;
      setPanelRect(clamped);
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [clampToViewport]);

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

  const toggleMaximize = useCallback(() => {
    if (isMaximized) {
      const restored = preMaxRectRef.current
        ? clampToViewport(preMaxRectRef.current)
        : getDefaultRect();
      rectRef.current = restored;
      setPanelRect(restored);
      saveToStorage(restored);
      setIsMaximized(false);
    } else {
      preMaxRectRef.current = { ...rectRef.current };
      const maxRect = getMaximizedRect();
      rectRef.current = maxRect;
      setPanelRect(maxRect);
      setIsMaximized(true);
    }
  }, [isMaximized, clampToViewport, getDefaultRect, saveToStorage]);

  const handleDragPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      if (isMaximized) setIsMaximized(false);

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
    },
    [isMaximized, saveToStorage],
  );

  const handleResizePointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

      if (isMaximized) setIsMaximized(false);

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

        const newW = Math.min(Math.max(resizeStartRef.current.startW + dx, minWidth), maxW);
        const newH = Math.min(Math.max(resizeStartRef.current.startH + dy, minHeight), maxH);

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
    },
    [isMaximized, minWidth, minHeight, saveToStorage],
  );

  return {
    panelRect,
    isDragging,
    isResizing,
    isMaximized,
    toggleMaximize,
    handleDragPointerDown,
    handleResizePointerDown,
  };
}
