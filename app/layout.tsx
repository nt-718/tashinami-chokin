import type { Metadata, Viewport } from 'next';
import './globals.css';

// GitHub Pages で公開している URL。画像などは /tashinami-chokin/ 以下にあるので、絶対 URL で指定する
const SITE_URL = 'https://nt-718.github.io/tashinami-chokin/';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: 'たしなみ貯金',
  description: 'ビールやタバコなど、いつもの嗜好品をやめた分だけびんに積み立てていく30日の貯金アプリ。',
  icons: { icon: `${SITE_URL}favicon.svg` },
  openGraph: {
    title: 'たしなみ貯金',
    description: '嗜好品をやめた分だけ、びんにたまっていく。30日の貯金アプリ。',
    url: SITE_URL,
    siteName: 'たしなみ貯金',
    locale: 'ja_JP',
    type: 'website',
    images: [{ url: `${SITE_URL}og.png`, width: 1672, height: 941, alt: 'たしなみ貯金' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'たしなみ貯金',
    description: '嗜好品をやめた分だけ、びんにたまっていく。30日の貯金アプリ。',
    images: [`${SITE_URL}og.png`],
  },
};

// サーバーでの処理はないので、GitHub Pages 向けに静的な HTML として書き出せる
export const dynamic = 'force-static';

export const viewport: Viewport = { themeColor: '#f5f6f8' };

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
