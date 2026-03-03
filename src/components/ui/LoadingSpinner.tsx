import { cn } from '@/lib/utils';
interface LoadingSpinnerProps { size?: 'sm' | 'md' | 'lg'; className?: string; text?: string; }
export default function LoadingSpinner({ size = 'md', className, text }: LoadingSpinnerProps) {
  const sizes: Record<string, string> = { sm: 'w-4 h-4 border-2', md: 'w-6 h-6 border-2', lg: 'w-10 h-10 border-[3px]' };
  return (
    <div className={cn('flex items-center justify-center gap-3', className)}>
      <div className={cn('border-brand-200 border-t-brand-600 rounded-full animate-spin', sizes[size])} />
      {text && <span className="text-sm text-surface-500">{text}</span>}
    </div>
  );
}
