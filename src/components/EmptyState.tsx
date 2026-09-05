import {
  Inbox,
  SearchX,
  ShieldOff,
  FileSearch,
  ClipboardList,
} from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
}

const defaultIcons = [Inbox, SearchX, ShieldOff, FileSearch, ClipboardList];

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  const UsedIcon = Icon || defaultIcons[Math.floor(Math.random() * defaultIcons.length)];
  return (
    <div className="empty-state-container">
      <div className="empty-state-icon">
        <UsedIcon size={36} />
      </div>
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {action && (
        <button type="button" className="primary-btn" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
