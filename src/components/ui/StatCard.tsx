import { cn } from '@/lib/utils';
interface StatCardProps { label: string; value: number | string; icon: React.ReactNode; badge?: string; color?: string; loading?: boolean; }
export default function StatCard({ label, value, icon, badge, color, loading }: StatCardProps) {
  return (
    <div className="stat-card">
      <div className="flex items-center justify-between mb-3">
        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center', color || 'bg-brand-50')}>{icon}</div>
        {badge && <span className="badge bg-surface-100 text-surface-500 text-[10px]">{badge}</span>}
      </div>
      <div className="text-3xl font-display font-bold text-surface-900">{loading ? <div className="w-12 h-8 bg-surface-100 rounded animate-pulse" /> : value}</div>
      <p className="text-sm text-surface-500 mt-1">{label}</p>
    </div>
  );
}
