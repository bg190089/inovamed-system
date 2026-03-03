interface EmptyStateProps { icon?: string; title: string; description?: string; action?: { label: string; onClick: () => void }; }
export default function EmptyState({ icon = '📋', title, description, action }: EmptyStateProps) {
  return (
    <div className="p-16 text-center">
      <div className="text-5xl mb-4">{icon}</div>
      <p className="text-surface-500 text-lg font-medium">{title}</p>
      {description && <p className="text-surface-400 text-sm mt-1.5">{description}</p>}
      {action && <button onClick={action.onClick} className="btn-primary text-sm mt-6">{action.label}</button>}
    </div>
  );
}
