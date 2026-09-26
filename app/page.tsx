'use client';

import { useEffect, useMemo, useState } from 'react';
import DailyBars from './daily-bars';
import JarCanvas from './jar-canvas';
import ProgressReport from './progress-report';
import { ITEM_SHAPES, MAX_ITEMS, TONES, guessShape, itemScale, type ItemShape } from './jar-config';
import type { JarItem } from './jar-scene';

type Habit = { id: string; name: string; price: number; count: number; mark: string; tone: number; shape: ItemShape };
// items は記録した時点の品目・金額・色・形・個数。あとで設定を変えても瓶の中身は変わらない
type RecordItem = { id: string; name: string; amount: number; tone: number; shape: ItemShape; units: number };
type RecordDay = { date: string; amount: number; itemIds: string[]; items: RecordItem[]; status: 'saved' | 'spent' };
// 保存するのは今の30日ぶんだけ。終わったら記録を消して、空のびんからやり直す
type GameState = { habits: Habit[]; records: RecordDay[]; startedAt: string };

const STORAGE_KEY = 'gaman-bank-v1';
const CHALLENGE_DAYS = 30;
// 書き忘れを後から入れられる日数（今日を含まない）
const BACKFILL_DAYS = 2;
// はじめて開いたとき（保存データがないとき）の品目。ほかは設定画面のプリセットから足す
const DEFAULT_HABITS: Habit[] = [
  { id: 'beer', name: 'ロング缶', price: 250, count: 2, mark: '缶', tone: 0, shape: 'can' },
];
// 設定画面からワンタップで追加できる品目。値段はよくある目安で、追加したあとに直せる
type Preset = Pick<Habit, 'name' | 'price' | 'count' | 'mark' | 'shape'>;
const PRESET_GROUPS: { label: string; items: Preset[] }[] = [
  { label: 'お酒', items: [
    { name: 'ロング缶', price: 250, count: 2, mark: '缶', shape: 'can' },
    { name: 'ハイボール缶', price: 200, count: 1, mark: '缶', shape: 'can' },
    { name: '居酒屋の一杯', price: 500, count: 1, mark: '杯', shape: 'coin' },
  ] },
  { label: 'タバコ', items: [
    { name: 'タバコ', price: 600, count: 1, mark: '煙', shape: 'pack' },
    { name: '加熱式タバコ', price: 580, count: 1, mark: '煙', shape: 'pack' },
  ] },
  { label: '飲みもの', items: [
    { name: '缶コーヒー', price: 150, count: 1, mark: '珈', shape: 'can' },
    { name: 'カフェのコーヒー', price: 500, count: 1, mark: '珈', shape: 'coin' },
    { name: 'エナジードリンク', price: 220, count: 1, mark: 'エ', shape: 'can' },
    { name: 'ジュース', price: 180, count: 1, mark: '飲', shape: 'can' },
  ] },
  { label: '甘いもの', items: [
    { name: 'お菓子', price: 200, count: 1, mark: '菓', shape: 'pack' },
    { name: 'コンビニスイーツ', price: 300, count: 1, mark: '甘', shape: 'pack' },
    { name: 'アイス', price: 200, count: 1, mark: '氷', shape: 'coin' },
  ] },
];

const toKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const parseKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const addDays = (key: string, days: number) => {
  const date = parseKey(key);
  date.setDate(date.getDate() + days);
  return toKey(date);
};
const daysBetween = (from: string, to: string) => Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86400000);
const shortDate = (key: string) => {
  const date = parseKey(key);
  return `${date.getMonth() + 1}/${date.getDate()}`;
};
const RELATIVE_DAY = ['今日', '昨日', 'おととい'];

const newHabitId = () => `habit-${Date.now()}`;
const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`;
const toneOf = (tone: number) => TONES[tone % TONES.length];

// 古い形式の記録（items / status / tone / shape なし）を今の形に直す
const normalizeState = (saved: Partial<GameState>, fallbackStart: string) => {
  const habits = saved.habits?.length
    ? saved.habits.map((habit, index) => ({ ...habit, tone: habit.tone ?? index % TONES.length, shape: habit.shape ?? guessShape(habit.name) }))
    : DEFAULT_HABITS;
  const records = (Array.isArray(saved.records) ? saved.records : []).map((record): RecordDay => {
    const status = record.status ?? (record.amount > 0 ? 'saved' : 'spent');
    if (record.items) {
      const items = record.items.map((item) => {
        const habit = habits.find(({ id }) => id === item.id);
        return { ...item, shape: item.shape ?? habit?.shape ?? guessShape(item.name), units: item.units ?? habit?.count ?? 1 };
      });
      return { ...record, status, items };
    }
    const items = habits
      .filter((habit) => record.itemIds?.includes(habit.id))
      .map((habit) => ({ id: habit.id, name: habit.name, amount: habit.price * habit.count, tone: habit.tone, shape: habit.shape, units: habit.count }));
    const itemTotal = items.reduce((sum, item) => sum + item.amount, 0);
    return {
      ...record,
      itemIds: record.itemIds ?? [],
      status,
      items: status === 'saved' && itemTotal !== record.amount
        ? [{ id: 'legacy', name: '以前の記録', amount: record.amount, tone: 0, shape: 'coin' as const, units: 1 }]
        : items,
    };
  });
  const startedAt = saved.startedAt || fallbackStart;
  // 前のチャレンジの記録が残っていたら捨てる
  return { habits, records: records.filter((record) => record.date >= startedAt), startedAt };
};

export default function Home() {
  const [habits, setHabits] = useState<Habit[]>(DEFAULT_HABITS);
  const [records, setRecords] = useState<RecordDay[]>([]);
  const [startedAt, setStartedAt] = useState('');
  const [today, setToday] = useState('');
  const [pickedDate, setPickedDate] = useState('');
  // 品目ごとに「実際に使った（飲んだ・吸った）数」。未入力なら 0＝全部がまんできた扱い
  const [usedUnits, setUsedUnits] = useState<Record<string, number>>({});
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftHabits, setDraftHabits] = useState<Habit[]>(DEFAULT_HABITS);
  const [ready, setReady] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const recordFor = (date: string) => records.find((record) => record.date === date);
  const dayIndexOf = (date: string) => (startedAt ? daysBetween(startedAt, date) : 0);
  const inChallenge = (date: string) => dayIndexOf(date) >= 0 && dayIndexOf(date) < CHALLENGE_DAYS;

  const todayIndex = today ? dayIndexOf(today) : 0;
  const challengeOver = todayIndex >= CHALLENGE_DAYS;
  // 記録できる日：今日と、書き忘れを埋められる直近の日（チャレンジ期間内のみ）
  const recordableDates = today
    ? Array.from({ length: BACKFILL_DAYS + 1 }, (_, offset) => addDays(today, -offset)).filter(inChallenge)
    : [];
  const activeDate = recordableDates.includes(pickedDate) ? pickedDate : recordableDates[0] ?? '';
  const activeOffset = activeDate ? daysBetween(activeDate, today) : 0;
  const activeLabel = RELATIVE_DAY[activeOffset] ?? shortDate(activeDate);
  const activeRecord = activeDate ? recordFor(activeDate) : undefined;

  const dailyTarget = habits.reduce((sum, habit) => sum + habit.price * habit.count, 0);
  // 記録済みの日は、がまんできた数から使った数を逆算して表示する
  const usedOf = (habit: Habit) => activeRecord
    ? Math.max(0, habit.count - (activeRecord.items.find((item) => item.id === habit.id)?.units ?? 0))
    : Math.min(habit.count, usedUnits[habit.id] ?? 0);
  const savedUnitsOf = (habit: Habit) => habit.count - usedOf(habit);
  const selectedAmount = habits.reduce((sum, habit) => sum + habit.price * savedUnitsOf(habit), 0);
  const savedRecords = records.filter((record) => record.status === 'saved');
  const totalSaved = savedRecords.reduce((sum, record) => sum + record.amount, 0);
  const completedDays = savedRecords.length;
  const goal = dailyTarget * CHALLENGE_DAYS;
  const progress = goal ? Math.min(100, (totalSaved / goal) * 100) : 0;

  let streak = 0;
  if (today && recordFor(today)?.status !== 'spent') {
    let cursor = recordFor(today)?.status === 'saved' ? today : addDays(today, -1);
    while (inChallenge(cursor) && recordFor(cursor)?.status === 'saved') {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
  }

  // 記録した順に、我慢した 1 本・1 箱をそのまま 1 個として瓶に入れる
  const jarItems = useMemo(() => {
    const items: JarItem[] = [];
    records.filter((record) => record.status === 'saved').forEach((record) => record.items.forEach((item) => {
      for (let unit = 0; unit < item.units; unit += 1) items.push({ shape: item.shape, tone: item.tone });
    }));
    return items.slice(0, MAX_ITEMS);
  }, [records]);
  // 目標を達成したときにちょうど瓶が埋まる大きさ
  const jarScale = itemScale(habits.reduce((sum, habit) => sum + habit.count * CHALLENGE_DAYS * ITEM_SHAPES[habit.shape].volume, 0));

  const habitTotals = useMemo(() => {
    const totals = new Map<string, RecordItem>();
    records.filter((record) => record.status === 'saved').forEach((record) => record.items.forEach((item) => {
      const current = totals.get(item.id);
      totals.set(item.id, { ...item, amount: (current?.amount ?? 0) + item.amount, units: (current?.units ?? 0) + item.units });
    }));
    return [...totals.values()];
  }, [records]);

  useEffect(() => {
    const currentToday = toKey(new Date());
    setToday(currentToday);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      let saved = normalizeState(raw ? JSON.parse(raw) as Partial<GameState> : {}, currentToday);
      // 開発用：?demo=goal で「30日ぜんぶ我慢できた」、?demo=mid で「18日目・ときどき失敗」の状態にする（元のデータは -backup に退避）
      const params = new URLSearchParams(window.location.search);
      const demo = process.env.NODE_ENV !== 'production' ? params.get('demo') : null;
      if (demo === 'goal' || demo === 'mid') {
        if (raw) window.localStorage.setItem(`${STORAGE_KEY}-backup`, raw);
        const demoStart = addDays(currentToday, demo === 'goal' ? -CHALLENGE_DAYS : -17);
        const demoDays = demo === 'goal' ? CHALLENGE_DAYS : 17;
        const demoRecords = Array.from({ length: demoDays }, (_, index): RecordDay => {
          const date = addDays(demoStart, index);
          if (demo === 'mid' && index % 6 === 4) return { date, amount: 0, itemIds: [], items: [], status: 'spent' };
          const items = saved.habits
            .map((habit) => ({ habit, units: demo === 'mid' && index % 3 === 1 ? Math.max(0, habit.count - 1) : habit.count }))
            .filter(({ units }) => units > 0)
            .map(({ habit, units }) => ({ id: habit.id, name: habit.name, amount: habit.price * units, tone: habit.tone, shape: habit.shape, units }));
          return { date, amount: items.reduce((sum, item) => sum + item.amount, 0), itemIds: items.map((item) => item.id), items, status: 'saved' };
        });
        saved = { ...saved, records: demoRecords, startedAt: demoStart };
        window.history.replaceState(null, '', window.location.pathname);
      }
      setHabits(saved.habits);
      setDraftHabits(saved.habits);
      setUsedUnits({});
      setRecords(saved.records);
      setStartedAt(saved.startedAt);
    } catch {
      window.localStorage.removeItem(STORAGE_KEY);
      setStartedAt(currentToday);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ habits, records, startedAt } satisfies GameState));
  }, [habits, records, startedAt, ready]);

  const pickDate = (date: string) => {
    setPickedDate(date);
    setUsedUnits({});
  };

  const stepUsed = (habit: Habit, diff: number) => {
    if (activeRecord) return;
    setUsedUnits((current) => ({ ...current, [habit.id]: Math.max(0, Math.min(habit.count, usedOf(habit) + diff)) }));
  };

  const saveDay = () => {
    if (!activeDate || activeRecord) return;
    const items = habits
      .filter((habit) => savedUnitsOf(habit) > 0)
      .map((habit) => ({ id: habit.id, name: habit.name, amount: habit.price * savedUnitsOf(habit), tone: habit.tone, shape: habit.shape, units: savedUnitsOf(habit) }));
    // 全部使った日は「使った日」として残す
    const status = selectedAmount > 0 ? 'saved' : 'spent';
    setRecords((current) => [...current, { date: activeDate, amount: selectedAmount, itemIds: items.map((item) => item.id), items, status }]);
    if (status === 'saved') {
      setJustSaved(true);
      window.setTimeout(() => setJustSaved(false), 1500);
    }
  };

  const removeRecord = () => setRecords((current) => current.filter((record) => record.date !== activeDate));

  const startNextChallenge = () => {
    setRecords([]);
    setStartedAt(today);
    setPickedDate('');
    setUsedUnits({});
  };

  const openSettings = () => {
    setDraftHabits(habits.map((habit) => ({ ...habit })));
    setSettingsOpen(true);
  };

  const saveSettings = () => {
    const cleaned = draftHabits
      .filter((habit) => habit.name.trim() && habit.price > 0 && habit.count > 0)
      .map((habit) => ({ ...habit, name: habit.name.trim() }));
    if (!cleaned.length) return;
    setHabits(cleaned);
    // 色と形は品目の見た目そのものなので、過去の記録にもさかのぼって反映する
    setRecords((current) => current.map((record) => ({
      ...record,
      items: record.items.map((item) => {
        const habit = cleaned.find(({ id }) => id === item.id);
        return habit ? { ...item, tone: habit.tone, shape: habit.shape } : item;
      }),
    })));
    setUsedUnits({});
    setSettingsOpen(false);
  };

  const updateDraft = (id: string, field: keyof Habit, value: string | number) => {
    setDraftHabits((current) => current.map((habit) => habit.id === id ? { ...habit, [field]: value } : habit));
  };

  // 他の品目と被らない次の色に切り替える
  const cycleTone = (id: string) => {
    setDraftHabits((current) => {
      const target = current.find((habit) => habit.id === id);
      if (!target) return current;
      const used = new Set(current.filter((habit) => habit.id !== id).map((habit) => habit.tone));
      let tone = target.tone;
      for (let step = 0; step < TONES.length; step += 1) {
        tone = (tone + 1) % TONES.length;
        if (!used.has(tone)) break;
      }
      return current.map((habit) => habit.id === id ? { ...habit, tone } : habit);
    });
  };

  const addDraftHabit = (preset: Preset = { name: '新しい習慣', price: 300, count: 1, mark: '他', shape: 'coin' }) => {
    if (draftHabits.length >= TONES.length) return;
    const id = newHabitId();
    // 使われていない色を割り当てる（過去の記録と色がかぶらないように）
    const usedTones = new Set([...draftHabits.map((habit) => habit.tone), ...habitTotals.map((item) => item.tone)]);
    const tone = TONES.findIndex((_, index) => !usedTones.has(index));
    setDraftHabits((current) => [...current, { ...preset, id, tone: tone === -1 ? current.length : tone }]);
  };

  const shownAmount = activeRecord ? activeRecord.amount : selectedAmount;
  // 日付の切り替え：recordableDates は [今日, 昨日, おととい] の順
  const activeIndex = recordableDates.indexOf(activeDate);
  const olderDate = recordableDates[activeIndex + 1];
  const newerDate = activeIndex > 0 ? recordableDates[activeIndex - 1] : undefined;
  const olderUnrecorded = recordableDates.slice(activeIndex + 1).some((date) => !recordFor(date));
  const question = activeRecord?.status === 'saved' ? `${activeLabel}のぶんは、びんに入りました`
    : activeRecord?.status === 'spent' ? `${activeLabel}は使った日`
      : `${activeLabel}、使った数は？`;

  return (
    <div className="app">
      <header className="header">
        <div className="header-inner">
          <a className="logo" href="#top"><span aria-hidden="true">🫙</span>たしなみ貯金</a>
          <button className="icon-button" type="button" onClick={openSettings} aria-label="がまんするものを設定">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>
          </button>
        </div>
      </header>

      <main className="main" id="top">
        <div className="side">
          <section className="jar-card area-jar" aria-label={`いまの貯金 ${totalSaved.toLocaleString('ja-JP')}円、目標の${Math.round(progress)}%`}>
            <div className="jar-stage">
              <JarCanvas items={jarItems} scale={jarScale} ready={ready} />
            </div>
            <p className="total">{yen(totalSaved)}</p>
            <div className="goal-line">
              <div className="progress" aria-hidden="true"><i style={{ width: `${progress}%` }} /></div>
              <span>目標 {yen(goal)}</span>
            </div>
            {habitTotals.length > 0 && (
              <ul className="chips" aria-label="びんの中身">
                {habitTotals.map((item) => (
                  <li key={item.id}><i style={{ background: toneOf(item.tone).hex }} />{habits.find((habit) => habit.id === item.id)?.name ?? item.name} {item.units}{ITEM_SHAPES[item.shape].unit}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="card area-days" aria-labelledby="days-title">
            <div className="card-head">
              <h2 id="days-title" className="card-title">30日のあしあと</h2>
              <p className="muted small">
                {completedDays}/{CHALLENGE_DAYS}日{streak > 1 && <> · <b className="streak">{streak}日連続</b></>}
              </p>
            </div>
            <DailyBars habits={habits} records={records} startedAt={startedAt} today={today} challengeDays={CHALLENGE_DAYS} dailyTarget={dailyTarget} />
          </section>
        </div>

        <div className="content">
          {challengeOver && (
            <section className="card finish area-today">
              <p className="finish-emoji" aria-hidden="true">🎉</p>
              <h2>30日で {yen(totalSaved)} たまりました</h2>
              <p className="muted">30日のうち {completedDays}日 がまんできました。次の30日は、空のびんからはじまります（今回の記録は消えます）。</p>
              <button className="button" type="button" onClick={startNextChallenge}>次の30日をはじめる</button>
            </section>
          )}

          {activeDate && (
            <section className="card today area-today" aria-labelledby="today-title">
              <div className="date-switch">
                <button type="button" onClick={() => olderDate && pickDate(olderDate)} disabled={!olderDate} aria-label="前の日">
                  ‹{olderUnrecorded && <i className="dot" aria-label="未記録の日があります" />}
                </button>
                <span>{activeLabel} · {shortDate(activeDate)}</span>
                <button type="button" onClick={() => newerDate && pickDate(newerDate)} disabled={!newerDate} aria-label="次の日">›</button>
              </div>
              <h2 id="today-title" className="question">{question}</h2>

              <ul className="tiles">
                {habits.map((habit) => {
                  const used = usedOf(habit);
                  const saved = habit.count - used;
                  const unit = ITEM_SHAPES[habit.shape].unit;
                  const locked = Boolean(activeRecord);
                  return (
                    <li key={habit.id} className={`tile ${saved > 0 ? 'is-selected' : ''} ${locked ? 'is-locked' : ''}`} style={{ '--tone': toneOf(habit.tone).hex } as React.CSSProperties}>
                      <span className="tile-name">{habit.name}</span>
                      <span className="tile-meta">いつも {habit.count}{unit}</span>
                      <div className="stepper">
                        <button type="button" onClick={() => stepUsed(habit, -1)} disabled={locked || used === 0} aria-label={`${habit.name}を1${unit}減らす`}>−</button>
                        <output aria-live="polite" aria-label={`${habit.name}を${used}${unit}使った`}><b>{used}</b>{unit}</output>
                        <button type="button" onClick={() => stepUsed(habit, 1)} disabled={locked || used >= habit.count} aria-label={`${habit.name}を1${unit}増やす`}>＋</button>
                      </div>
                      <span className="tile-amount">{saved > 0 ? `+${yen(habit.price * saved)}` : '±0'}</span>
                    </li>
                  );
                })}
              </ul>

              {activeRecord ? (
                <p className="done-line">
                  {activeRecord.status === 'saved' ? `+${yen(activeRecord.amount)}` : 'リセットはありません。明日も続きから。'}
                  <button type="button" onClick={removeRecord}>取り消す</button>
                </p>
              ) : (
                <>
                  <button className={`button ${selectedAmount === 0 ? 'is-plain' : ''}`} type="button" onClick={saveDay}>
                    {selectedAmount > 0 ? <>記録する<span>+{yen(selectedAmount)}</span></> : '使った日として記録する'}
                  </button>
                </>
              )}
            </section>
          )}

          <ProgressReport habits={habits} records={records} startedAt={startedAt} today={today} challengeDays={CHALLENGE_DAYS} />
        </div>
      </main>

      <footer className="footer">
        <p>がまんは罰じゃなくて、未来の自分へのちいさな仕送り。</p>
        <p>{startedAt ? `${startedAt.replaceAll('-', '.')} から` : ''} · データはこの端末にだけ保存されます</p>
      </footer>

      <div className={`toast ${justSaved ? 'is-shown' : ''}`} role="status" aria-live="polite">
        {justSaved ? `${yen(shownAmount)} をびんに入れました` : ''}
      </div>

      {settingsOpen && (
        <div className="backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <div className="sheet-head">
              <h2 id="settings-title">がまんするもの</h2>
              <button className="icon-button" type="button" onClick={() => setSettingsOpen(false)} aria-label="閉じる">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <p className="muted small">いつもの1日ぶんを登録します。色の丸をタップすると色が変わります。</p>
            <div className="drafts">
              {draftHabits.map((habit) => (
                <div className="draft" key={habit.id}>
                  <button type="button" className="swatch is-button" style={{ background: toneOf(habit.tone).hex }} onClick={() => cycleTone(habit.id)} aria-label={`${habit.name}の色を変える`} />
                  <label className="field is-wide"><span>なまえ</span><input value={habit.name} onChange={(event) => updateDraft(habit.id, 'name', event.target.value)} /></label>
                  <label className="field"><span>かたち</span><select value={habit.shape} onChange={(event) => updateDraft(habit.id, 'shape', event.target.value)}>
                    {(Object.keys(ITEM_SHAPES) as ItemShape[]).map((shape) => <option key={shape} value={shape}>{ITEM_SHAPES[shape].label}</option>)}
                  </select></label>
                  <label className="field"><span>単価</span><input type="number" inputMode="numeric" min="1" value={habit.price} onChange={(event) => updateDraft(habit.id, 'price', Number(event.target.value))} /></label>
                  <label className="field"><span>1日の数</span><input type="number" inputMode="numeric" min="1" max="20" value={habit.count} onChange={(event) => updateDraft(habit.id, 'count', Number(event.target.value))} /></label>
                  {draftHabits.length > 1 && <button type="button" className="remove" onClick={() => setDraftHabits((current) => current.filter((item) => item.id !== habit.id))} aria-label={`${habit.name}を削除`}>削除</button>}
                </div>
              ))}
            </div>
            <div className="presets">
              <p className="muted small">よくあるものから追加（{TONES.length}つまで）</p>
              {PRESET_GROUPS.map((group) => (
                <div className="preset-group" key={group.label}>
                  <span>{group.label}</span>
                  <div>
                    {group.items.map((preset) => {
                      const added = draftHabits.some((habit) => habit.name === preset.name);
                      return (
                        <button key={preset.name} type="button" className={`preset ${added ? 'is-added' : ''}`} onClick={() => addDraftHabit(preset)}
                          disabled={added || draftHabits.length >= TONES.length} aria-label={`${preset.name}（${yen(preset.price)}）を追加`}>
                          {added ? '✓ ' : '＋ '}{preset.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <button className="text-button" type="button" onClick={() => addDraftHabit()} disabled={draftHabits.length >= TONES.length}>＋ 自分で追加する</button>
            <p className="sheet-total"><span>1日ぜんぶがまんできたら</span><b>{yen(draftHabits.reduce((sum, habit) => sum + habit.price * habit.count, 0))}</b></p>
            <button className="button" type="button" onClick={saveSettings}>保存する</button>
          </section>
        </div>
      )}
    </div>
  );
}
