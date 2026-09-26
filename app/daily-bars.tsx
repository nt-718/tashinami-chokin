'use client';

import { useEffect, useRef, useState } from 'react';
import { ITEM_SHAPES, TONES, type ItemShape } from './jar-config';

// page.tsx の型と構造だけ合わせた、グラフに必要な最小限の形
type BarHabit = { id: string; name: string; tone: number };
type BarItem = { id: string; name: string; amount: number; units: number; tone: number; shape: ItemShape };
type BarRecord = { date: string; amount: number; status: 'saved' | 'spent'; items: BarItem[] };

const yen = (value: number) => `¥${Math.round(value).toLocaleString('ja-JP')}`;
const parseKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const addDays = (key: string, days: number) => {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};
const shortDate = (key: string) => `${parseKey(key).getMonth() + 1}/${parseKey(key).getDate()}`;

// 1 日 1 本の棒。がまんできた分を品目の色で積み上げ、破線は 1 日の目標額
export default function DailyBars({ habits, records, startedAt, today, challengeDays, dailyTarget }: {
  habits: BarHabit[]; records: BarRecord[]; startedAt: string; today: string; challengeDays: number; dailyTarget: number;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(300);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const toneOf = (item: BarItem) => TONES[(habits.find((habit) => habit.id === item.id)?.tone ?? item.tone) % TONES.length].hex;
  const days = Array.from({ length: challengeDays }, (_, index) => {
    const date = addDays(startedAt, index);
    return { date, record: records.find((record) => record.date === date), future: date > today };
  });

  const todayIndex = days.findIndex(({ date }) => date === today);
  const height = 150;
  const pad = { top: 8, bottom: 22 };
  const plotH = height - pad.top - pad.bottom;
  const slot = width / challengeDays;
  const barW = Math.max(3, Math.min(14, slot * 0.62));
  const yMax = Math.max(dailyTarget, ...days.map(({ record }) => (record?.status === 'saved' ? record.amount : 0)), 1);
  const h = (value: number) => (value / yMax) * plotH;
  const baseY = pad.top + plotH;
  const barX = (index: number) => index * slot + (slot - barW) / 2;

  const onMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const index = Math.floor((event.clientX - rect.left) / slot);
    setHover(index >= 0 && index < challengeDays && !days[index].future ? index : null);
  };

  const hovered = hover === null ? null : days[hover];
  const tooltipLeft = hover === null ? 0 : Math.max(0, Math.min(barX(hover) + barW + 8, width - 150));

  return (
    <div className="bar-chart" ref={boxRef}>
      <div className="chart-frame">
        <svg width={width} height={height} role="img" aria-label={`日ごとのがまんした金額。1日の目標は${yen(dailyTarget)}`}
          onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
          <line className="chart-grid" x1={0} x2={width} y1={baseY} y2={baseY} />
          {hover !== null && <rect className="chart-hover" x={hover * slot} y={pad.top} width={slot} height={plotH} rx={4} />}
          {days.map(({ record, future }, index) => {
            const x = barX(index);
            if (record?.status !== 'saved') {
              // 使った日・未記録・これからの日は、下に小さな印だけ置く
              return <rect key={index} className={`chart-slot ${record?.status === 'spent' ? 'is-spent' : ''}`} x={x} y={baseY - 3} width={barW} height={3} rx={1.5} opacity={future ? 0.5 : 1} />;
            }
            let offset = 0;
            return (
              <g key={index}>
                {record.items.map((item) => {
                  const segment = h(item.amount);
                  offset += segment;
                  return <rect key={item.id} x={x} y={baseY - offset} width={barW} height={Math.max(0, segment - 1)} rx={Math.min(3, barW / 2)} fill={toneOf(item)} />;
                })}
              </g>
            );
          })}
          <line className="chart-goal" x1={0} x2={width} y1={baseY - h(dailyTarget)} y2={baseY - h(dailyTarget)} />
          {todayIndex >= 0 && todayIndex < challengeDays && (
            <circle className="chart-today" cx={barX(todayIndex) + barW / 2} cy={baseY + 5} r={2.5} />
          )}
          {[0, 9, 19, challengeDays - 1].map((index) => (
            <text key={index} className="chart-axis" x={barX(index) + barW / 2} y={height - 2} textAnchor="middle">{index + 1}</text>
          ))}
        </svg>
        {hovered && hover !== null && (
          <div className="chart-tooltip" style={{ left: tooltipLeft }}>
            <small>{hover + 1}日目 · {shortDate(hovered.date)}</small>
            {hovered.record?.status === 'saved' ? (
              <>
                <b>+{yen(hovered.record.amount)}</b>
                <ul>
                  {hovered.record.items.map((item) => (
                    <li key={item.id}><i style={{ background: toneOf(item) }} />{item.name}<span>{item.units}{ITEM_SHAPES[item.shape].unit}</span></li>
                  ))}
                </ul>
              </>
            ) : <b>{hovered.record?.status === 'spent' ? '使った日' : '未記録'}</b>}
          </div>
        )}
      </div>
      <ul className="legend" aria-hidden="true">
        {habits.map((habit) => <li key={habit.id}><i style={{ background: TONES[habit.tone % TONES.length].hex }} />{habit.name}</li>)}
        <li><i className="is-spent" />使った</li>
        <li><i className="is-goal" />1日の目標</li>
      </ul>
    </div>
  );
}
