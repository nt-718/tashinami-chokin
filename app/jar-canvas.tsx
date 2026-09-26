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
  // 増やすと 3D を作り直す（表示が止まったあとの「もう一度表示する」）
  const [attempt, setAttempt] = useState(0);

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
        const handle = createJarScene(container, {
          reducedMotion,
          onContextLost: () => {
            if (cancelled) return;
            setFailReason('lost');
            setStatus('failed');
          },
        });
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
  }, [ready, attempt]);

  const retry = () => {
    // 止まった 3D を片付けてから作り直す
    sceneRef.current?.dispose();
    sceneRef.current = null;
    setFailReason('');
    setStatus('loading');
    setAttempt((current) => current + 1);
  };

  return (
    <div className={`jar-canvas is-${status}`} ref={containerRef}>
      {status === 'failed' && failReason === 'lost' && (
        <div className="jar-fallback">
          <p>端末の負荷が高くなったため、3D 表示が止まりました。</p>
          <button type="button" onClick={retry}>もう一度表示する</button>
        </div>
      )}
      {status === 'failed' && failReason !== 'lost' && (
        <div className="jar-fallback">
          <p>この端末では 3D 表示を利用できません。</p>
          <p className="small">ブラウザを一度閉じて開き直すと、表示できることがあります。</p>
          {failReason && <small>{failReason}</small>}
        </div>
      )}
    </div>
  );
}
