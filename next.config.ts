import type { NextConfig } from 'next';

// GitHub Pages 用のビルド（GITHUB_PAGES=true）では静的ファイルに書き出し、/tashinami-chokin/ 以下で配信する
const isGitHubPages = process.env.GITHUB_PAGES === 'true';

const nextConfig: NextConfig = isGitHubPages
  ? { output: 'export', assetPrefix: '/tashinami-chokin' }
  : {};

export default nextConfig;
