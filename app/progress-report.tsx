import { ITEM_SHAPES, TONES, type ItemShape } from './jar-config';

// page.tsx の型と構造だけ合わせた、レポートに必要な最小限の形
type ReportHabit = { id: string; name: string; price: number; count: number; tone: number; shape: ItemShape };
type ReportItem = { id: string; name: string; amount: number; units: number; tone: number; shape: ItemShape };
type ReportRecord = { date: string; amount: number; status: 'saved' | 'spent'; items: ReportItem[] };

type Props = {
  habits: ReportHabit[];
  records: ReportRecord[];
  startedAt: string;
  today: string;
  challengeDays: number;
};

// タバコ 1 箱の本数。箱で記録した分を「吸わなかった本数」に言い換えるのに使う
const CIGARETTES_PER_PACK = 20;

const yen = (value: number) => `¥${Math.round(value).toLocaleString('ja-JP')}`;
const parseKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const daysBetween = (from: string, to: string) => Math.round((parseKey(to).getTime() - parseKey(from).getTime()) / 86400000);
const unitsLabel = (units: number, shape: ItemShape) =>
  shape === 'pack' ? `${units}${ITEM_SHAPES.pack.unit}（約${units * CIGARETTES_PER_PACK}本）` : `${units}${ITEM_SHAPES[shape].unit}`;

export default function ProgressReport({ habits, records, startedAt, today, challengeDays }: Props) {
  if (!startedAt || !today) return null;

  const elapsedDays = Math.max(1, Math.min(daysBetween(startedAt, today) + 1, challengeDays));
  // 未記録の日は「どうだったか分からない日」なので、我慢率の分母には入れない
  const recordedDays = records.length;
  const savedRecords = records.filter((record) => record.status === 'saved');
  const totalSaved = savedRecords.reduce((sum, record) => sum + record.amount, 0);
  const dailyTarget = habits.reduce((sum, habit) => sum + habit.price * habit.count, 0);
  const overallRate = recordedDays && dailyTarget ? totalSaved / (dailyTarget * recordedDays) : 0;

  const perHabit = habits.map((habit) => {
    const items = savedRecords.flatMap((record) => record.items.filter((item) => item.id === habit.id));
    const units = items.reduce((sum, item) => sum + item.units, 0);
    const amount = items.reduce((sum, item) => sum + item.amount, 0);
    const usual = habit.count * recordedDays;
    return { habit, units, amount, usual, rate: usual ? Math.min(1, units / usual) : 0 };
  });

  // 経過日数あたりの平均（未記録の日も 0 円として数える控えめな見積もり）
  const perDay = totalSaved / elapsedDays;

  const yearly = perDay * 365;

  return (
    <section className="card report area-report" aria-labelledby="report-title">
      <h2 id="report-title" className="card-title">ふりかえり</h2>
      <p className="report-lead">
        {recordedDays > 0
          ? <>いつもの <b>{Math.round(overallRate * 100)}%</b> をがまんできています。</>
          : '記録をつけると、どれくらい減らせたかがここに出ます。'}
      </p>

      <ul className="meters">
        {perHabit.map(({ habit, units, amount, usual, rate }) => (
          <li key={habit.id}>
            <div className="meter-row">
              <span><i style={{ background: TONES[habit.tone % TONES.length].hex }} />{habit.name}</span>
              <span className="muted small">{unitsLabel(units, habit.shape)} / {usual}{ITEM_SHAPES[habit.shape].unit} · {yen(amount)}</span>
            </div>
            <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(rate * 100)} aria-label={`${habit.name}のがまん率`}>
              <i style={{ width: `${rate * 100}%`, background: TONES[habit.tone % TONES.length].hex }} />
            </div>
          </li>
        ))}
      </ul>

      <div className="insight">
        <span aria-hidden="true">💡</span>
        <p>
          <span>このペースなら、1年で <b>{yen(yearly)}</b></span>
          <span className="muted small">1日平均 {yen(perDay)}（未記録の日は0円として計算）</span>
        </p>
      </div>
    </section>
  );
}
