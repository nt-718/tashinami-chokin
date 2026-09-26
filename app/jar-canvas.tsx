'use client';

import { useEffect, useRef, useState } from 'react';
import type { JarItem, JarSceneHandle } from './jar-scene';

type Props = { items: JarItem[]; scale: number; ready: boolean };

export default function JarCanvas({ items, scale, ready }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<JarSceneHandle | null>(null);
  const latestRef = useRef({ items, scale });
  const [status, setStatus] = useState<'loading' | 'ready' | 'failed'>('loading');
  // 失敗した理由。端末ごとの原因を調べられるよう、画面に小さく出す
  const [failReason, setFailReason] = useState('');

  useEffect(() => {
    const previous = latestRef.current.items.length;
    latestRef.current = { items, scale };
    const scene = sceneRef.current;
    const container = containerRef.current;
    if (!scene || !container) return;
    // 缶や箱が落ちる瞬間が見えないと意味がないので、瓶が画面外ならスクロールしてから落とす
    const rect = container.getBoundingClientRect();
    const center = rect.top + rect.height / 2;
    const offscreen = center < window.innerHeight * 0.15 || center > window.innerHeight * 0.85;
    if (items.length <= previous || !offscreen) {
      scene.setItems(items, scale, true);
      return;
    }
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    container.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' });
    const timer = window.setTimeout(() => scene.setItems(items, scale, true), reducedMotion ? 0 : 550);
    return () => window.clearTimeout(timer);
  }, [items, scale]);

  useEffect(() => {
    if (!ready || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;
    // three.js はクライアントでだけ読み込む（SSR バンドルを軽く保つ）
    import('./jar-scene')
      .then(({ createJarScene }) => {
        if (cancelled) return;
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const handle = createJarScene(container, { reducedMotion });
        handle.setItems(latestRef.current.items, latestRef.current.scale, false);
        sceneRef.current = handle;
        setStatus('ready');
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        console.error(error);
        setFailReason(error instanceof Error ? error.message : String(error));
        setStatus('failed');
      });
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
  }, [ready]);

  return (
    <div className={`jar-canvas is-${status}`} ref={containerRef}>
      {status === 'failed' && (
        <p className="jar-fallback">
          この端末では 3D 表示を利用できません。
          {failReason && <small>{failReason}</small>}
        </p>
      )}
    </div>
  );
}
