"use client";

import { useEffect, useRef } from "react";

/**
 * Фирменная hero-анимация: мягкие звуковые волны (мотив голоса — суть продукта)
 * в бренд-цветах на белом. Лёгкий Canvas2D, без зависимостей. Уважает
 * prefers-reduced-motion (один статичный кадр), ставится на паузу на скрытой
 * вкладке, чистит ресурсы при размонтировании, учитывает DPR.
 */
export function HeroCanvas() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    // Аннотации фиксируют не-null тип внутри вложенных функций (TS не сужает
    // захваченные переменные в замыканиях).
    const cnv: HTMLCanvasElement = canvas;
    const g: CanvasRenderingContext2D = context;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let t = 0;
    let w = 0;
    let h = 0;

    const waves = [
      { amp: 26, freq: 1.3, speed: 0.55, y: 0.44, color: "67,171,208", alpha: 0.24, width: 2 },
      { amp: 34, freq: 0.9, speed: 0.38, y: 0.52, color: "67,171,208", alpha: 0.17, width: 2.6 },
      { amp: 20, freq: 2.0, speed: 0.85, y: 0.6, color: "67,171,208", alpha: 0.13, width: 1.6 },
      { amp: 30, freq: 1.6, speed: 0.48, y: 0.48, color: "251,53,1", alpha: 0.1, width: 2 },
      { amp: 16, freq: 2.5, speed: 1.05, y: 0.64, color: "251,53,1", alpha: 0.07, width: 1.5 },
    ];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = cnv.clientWidth;
      h = cnv.clientHeight;
      cnv.width = w * dpr;
      cnv.height = h * dpr;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function drawWave(wv: (typeof waves)[number], phase: number) {
      g.beginPath();
      const baseY = h * wv.y;
      for (let x = 0; x <= w; x += 6) {
        const k = x / w;
        const env = Math.sin(Math.PI * k); // мягкое затухание к краям
        const y = baseY + Math.sin(k * Math.PI * 2 * wv.freq + phase) * wv.amp * env;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.strokeStyle = `rgba(${wv.color},${wv.alpha})`;
      g.lineWidth = wv.width;
      g.shadowColor = `rgba(${wv.color},${wv.alpha})`;
      g.shadowBlur = 14;
      g.stroke();
      g.shadowBlur = 0;
    }

    function drawStatic() {
      if (w <= 0) return;
      g.clearRect(0, 0, w, h);
      for (const wv of waves) drawWave(wv, 0.6);
    }

    function frame() {
      g.clearRect(0, 0, w, h);
      for (const wv of waves) drawWave(wv, t * wv.speed);
      t += 0.02;
      raf = requestAnimationFrame(frame);
    }

    // ResizeObserver ловит и первичный 0→реальный размер (важно при ленивой
    // раскладке), и адаптивные ресайзы — надёжнее window 'resize'.
    const ro = new ResizeObserver(() => {
      resize();
      if (reduce) drawStatic();
    });
    ro.observe(cnv);
    resize();

    if (reduce) {
      drawStatic();
      return () => ro.disconnect();
    }

    raf = requestAnimationFrame(frame);
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}
