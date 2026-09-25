'use client';

import { useEffect, useMemo, useState } from 'react';

type Habit = { id: string; name: string; price: number; count: number; mark: string };
type RecordDay = { date: string; amount: number; itemIds: string[] };
type GameState = { habits: Habit[]; records: RecordDay[]; startedAt: string };

const STORAGE_KEY = 'gaman-bank-v1';
const DEFAULT_HABITS: Habit[] = [
  { id: 'beer', name: 'ロング缶', price: 250, count: 2, mark: '缶' },
  { id: 'smoke', name: 'タバコ', price: 500, count: 1, mark: '煙' },
];

const localDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};

const yen = (value: number) => `¥${value.toLocaleString('ja-JP')}`;

export default function Home() {
  const [habits, setHabits] = useState<Habit[]>(DEFAULT_HABITS);
  const [records, setRecords] = useState<RecordDay[]>([]);
  const [startedAt, setStartedAt] = useState('');
  const [today, setToday] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>(DEFAULT_HABITS.map((habit) => habit.id));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draftHabits, setDraftHabits] = useState<Habit[]>(DEFAULT_HABITS);
  const [ready, setReady] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const todayRecord = records.find((record) => record.date === today);
  const dailyTarget = habits.reduce((sum, habit) => sum + habit.price * habit.count, 0);
  const selectedAmount = habits
    .filter((habit) => selectedIds.includes(habit.id))
    .reduce((sum, habit) => sum + habit.price * habit.count, 0);
  const totalSaved = records.reduce((sum, record) => sum + record.amount, 0);
  const completedDays = Math.min(records.length, 30);
  const goal = dailyTarget * 30;
  const progress = goal ? Math.min(100, (totalSaved / goal) * 100) : 0;
  const dayNumber = Math.min(completedDays + (todayRecord ? 0 : 1), 30);

  useEffect(() => {
    const currentToday = localDateKey();
    setToday(currentToday);
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as GameState;
        if (saved.habits?.length) {
          setHabits(saved.habits);
          setDraftHabits(saved.habits);
          setSelectedIds(saved.habits.map((habit) => habit.id));
        }
        if (Array.isArray(saved.records)) setRecords(saved.records);
        setStartedAt(saved.startedAt || currentToday);
      } else {
        setStartedAt(currentToday);
      }
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

  const coins = useMemo(() => {
    const base = Math.max(6, Math.round(progress * 0.48));
    return Array.from({ length: Math.min(48, base) });
  }, [progress]);

  const toggleHabit = (id: string) => {
    if (todayRecord) return;
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const saveToday = () => {
    if (!today || todayRecord || selectedAmount <= 0 || completedDays >= 30) return;
    setRecords((current) => [...current, { date: today, amount: selectedAmount, itemIds: selectedIds }]);
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1500);
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
    setSelectedIds(cleaned.map((habit) => habit.id));
    setSettingsOpen(false);
  };

  const updateDraft = (id: string, field: keyof Habit, value: string | number) => {
    setDraftHabits((current) => current.map((habit) => habit.id === id ? { ...habit, [field]: value } : habit));
  };

  const addDraftHabit = () => {
    if (draftHabits.length >= 5) return;
    const id = `habit-${Date.now()}`;
    setDraftHabits((current) => [...current, { id, name: '新しい習慣', price: 300, count: 1, mark: '他' }]);
  };

  const removeToday = () => setRecords((current) => current.filter((record) => record.date !== today));

  return (
    <main className={`app-shell ${justSaved ? 'is-celebrating' : ''}`}>
      <nav className="topbar" aria-label="メインナビゲーション">
        <a className="brand" href="#top" aria-label="GAMAN BANK ホーム">
          <span className="brand-mark">G</span><span>GAMAN BANK</span>
        </a>
        <div className="nav-progress" aria-label={`30日中${completedDays}日達成`}>
          <span>30日チャレンジ</span>
          <div><i style={{ width: `${(completedDays / 30) * 100}%` }} /></div>
          <strong>{String(completedDays).padStart(2, '0')} / 30</strong>
        </div>
        <button className="settings-button" type="button" onClick={openSettings} aria-label="貯金ルールを設定">
          <i /><i /><i /><span>設定</span>
        </button>
      </nav>

      <section className="game-stage" id="top">
        <div className="intro-copy">
          <p className="eyebrow"><span /> DAY {String(dayNumber).padStart(2, '0')} · {todayRecord ? '今日の貯金は完了' : 'まだ何も使っていない日'}</p>
          <h1>今日の我慢を、<br /><em>明日の余裕</em>に。</h1>
          <p className="lead">いつもの一本、いつもの一箱。見送った分だけ、コインがあなたの貯金瓶に落ちていきます。</p>

          <div className="today-card">
            <div className="today-total">
              <span>今日、守れるお金</span>
              <strong>{yen(todayRecord?.amount ?? selectedAmount)}</strong>
            </div>
            <div className="habit-list">
              {habits.map((habit, index) => {
                const selected = todayRecord ? todayRecord.itemIds.includes(habit.id) : selectedIds.includes(habit.id);
                return (
                  <button
                    className={`habit-row ${selected ? 'is-selected' : ''}`}
                    type="button"
                    key={habit.id}
                    onClick={() => toggleHabit(habit.id)}
                    aria-pressed={selected}
                    disabled={Boolean(todayRecord)}
                  >
                    <span className={`habit-icon tone-${index % 4}`}>{habit.mark.slice(0, 1)}</span>
                    <span><b>{habit.name}</b><small>{yen(habit.price)} × {habit.count}{habit.name.includes('タバコ') ? '箱' : 'つ'}</small></span>
                    <strong>{yen(habit.price * habit.count)}</strong>
                    <i className="check">✓</i>
                  </button>
                );
              })}
            </div>
            <button
              className={`save-button ${todayRecord ? 'is-saved' : ''}`}
              type="button"
              onClick={saveToday}
              disabled={Boolean(todayRecord) || selectedAmount === 0}
            >
              <span>{todayRecord ? '✓' : '＋'}</span>
              {todayRecord ? '今日の貯金、完了！' : '今日は我慢できた'}
            </button>
            <p className="button-note">
              {todayRecord ? <button type="button" onClick={removeToday}>記録を取り消す</button> : `選んだ分 ${yen(selectedAmount)} が貯金瓶に入ります`}
            </p>
          </div>
        </div>

        <div className="jar-zone" aria-label={`現在の貯金額 ${totalSaved.toLocaleString('ja-JP')}円`}>
          <div className="orbit orbit-one" /><div className="orbit orbit-two" />
          <span className="saving-note note-one">NO SPEND<br /><b>GOOD DAY!</b></span>
          <span className="saving-note note-two">+ {yen(selectedAmount)}</span>
          <div className="coin coin-a">¥</div><div className="coin coin-b">¥</div>
          {justSaved && Array.from({ length: 9 }).map((_, index) => <i className="falling-coin" key={index} style={{ '--fall': index, left: `${31 + index * 5}%` } as React.CSSProperties}>¥</i>)}
          <div className={`jar ${todayRecord ? 'jar-filled' : ''}`}>
            <div className="jar-rim" />
            <div className="jar-glass">
              <div className="jar-shine" />
              <div className="coin-pile" style={{ height: `${Math.max(70, 70 + progress * 2.65)}px` }}>
                {coins.map((_, index) => (
                  <i key={index} style={{ left: `${18 + ((index * 47) % 230)}px`, bottom: `${7 + (index % 8) * 21}px`, transform: `rotate(${(index * 19) % 52 - 26}deg)` }}>¥</i>
                ))}
              </div>
              <div className="jar-label"><small>30 DAYS</small><b>GAMAN</b><span>SAVINGS CLUB</span></div>
              <div className="fill-line" style={{ bottom: `${Math.min(82, 16 + progress * .66)}%` }}><span>{Math.round(progress)}%</span></div>
            </div>
          </div>
          <div className="jar-value">
            <span>いまの貯金</span><strong>{yen(totalSaved)}</strong><small>目標 {yen(goal)}</small>
          </div>
        </div>
      </section>

      <section className="dashboard" aria-labelledby="result-title">
        <div className="dashboard-heading">
          <div><p className="eyebrow"><span /> YOUR PROGRESS</p><h2 id="result-title">我慢は、ちゃんと<br />形になっている。</h2></div>
          <p>開始日 {startedAt ? startedAt.replaceAll('-', '.') : '—'}<br />この端末に自動保存されています。</p>
        </div>
        <div className="stats-grid">
          <article><small>これまでの貯金</small><strong>{yen(totalSaved)}</strong><span>目標まであと {yen(Math.max(0, goal - totalSaved))}</span></article>
          <article><small>継続できた日</small><strong>{completedDays}<em>日</em></strong><span>一歩ずつで大丈夫</span></article>
          <article><small>我慢した回数</small><strong>{records.reduce((sum, record) => sum + record.itemIds.length, 0)}<em>回</em></strong><span>小さな選択の積み重ね</span></article>
        </div>
        <div className="calendar-card">
          <div className="calendar-copy"><span>30 DAYS MAP</span><b>ゴールまでの足あと</b></div>
          <div className="day-map">
            {Array.from({ length: 30 }).map((_, index) => {
              const done = index < completedDays;
              const active = index === completedDays && completedDays < 30;
              return <span key={index} className={`${done ? 'done' : ''} ${active ? 'active' : ''}`}><i>{done ? '✓' : index + 1}</i></span>;
            })}
          </div>
        </div>
      </section>

      <footer><span>GAMAN BANK</span><p>我慢は罰じゃない。未来の自分への、ちいさな仕送りだ。</p><a href="#top">TOP ↑</a></footer>

      {settingsOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
            <button className="modal-close" type="button" onClick={() => setSettingsOpen(false)} aria-label="閉じる">×</button>
            <p className="eyebrow"><span /> MY SAVING RULE</p>
            <h2 id="settings-title">何を我慢して、<br />いくら貯める？</h2>
            <p className="modal-lead">自分の「つい買ってしまうもの」に合わせて、1日のルールを作れます。</p>
            <div className="draft-list">
              {draftHabits.map((habit, index) => (
                <div className="draft-row" key={habit.id}>
                  <span className={`habit-icon tone-${index % 4}`}>{habit.mark.slice(0, 1)}</span>
                  <label>品目<input value={habit.name} onChange={(event) => updateDraft(habit.id, 'name', event.target.value)} /></label>
                  <label>単価<input type="number" min="1" value={habit.price} onChange={(event) => updateDraft(habit.id, 'price', Number(event.target.value))} /></label>
                  <label>個数<input type="number" min="1" max="20" value={habit.count} onChange={(event) => updateDraft(habit.id, 'count', Number(event.target.value))} /></label>
                  {draftHabits.length > 1 && <button type="button" onClick={() => setDraftHabits((current) => current.filter((item) => item.id !== habit.id))} aria-label={`${habit.name}を削除`}>×</button>}
                </div>
              ))}
            </div>
            <button className="add-habit" type="button" onClick={addDraftHabit} disabled={draftHabits.length >= 5}>＋ 品目を追加</button>
            <div className="modal-total"><span>1日ぜんぶ我慢できたら</span><strong>{yen(draftHabits.reduce((sum, habit) => sum + habit.price * habit.count, 0))}</strong></div>
            <button className="save-button" type="button" onClick={saveSettings}>このルールではじめる</button>
          </section>
        </div>
      )}
      <div className="sr-only" aria-live="polite">{justSaved ? `${yen(selectedAmount)}を貯金しました` : ''}</div>
    </main>
  );
}
