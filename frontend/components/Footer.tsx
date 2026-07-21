import HfIcon from './HfIcon';
import BrandMark from './BrandMark';

export default function Footer() {
  return (
    <footer className="mt-16 border-t border-zinc-200 py-8 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
      <p className="inline-flex items-center gap-2">
        <BrandMark className="h-6 w-6 rounded-md" />
        OpenFace - ローカルAIコミュニティハブ
      </p>
      <p className="mt-1">
        基盤：{' '}
        <a href="/git/" className="inline-flex items-center gap-1 underline hover:text-amber-700 dark:hover:text-amber-400">
          <HfIcon name="code" className="h-3 w-3" />
          Forgejo
        </a>
      </p>
    </footer>
  );
}
