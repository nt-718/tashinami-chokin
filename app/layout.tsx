import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://gaman-bank.nakagawatakahiro.chatgpt.site'),
  title: 'GAMAN BANK — 我慢が貯金になる30日ゲーム',
  description: 'いつもの嗜好品を我慢した分だけ、貯金瓶にコインが落ちていく30日チャレンジ。',
  openGraph: {
    title: 'GAMAN BANK',
    description: '今日の我慢を、明日の余裕に。30日で貯金瓶を満たそう。',
    url: 'https://gaman-bank.nakagawatakahiro.chatgpt.site',
    siteName: 'GAMAN BANK',
    locale: 'ja_JP',
    type: 'website',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'GAMAN BANKの貯金瓶' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GAMAN BANK',
    description: '今日の我慢を、明日の余裕に。30日で貯金瓶を満たそう。',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
