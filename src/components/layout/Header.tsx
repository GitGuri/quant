import React from 'react';
import { Button } from 'antd';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { RefreshCw, Plus } from 'lucide-react';
import { motion } from 'framer-motion';

type HeaderProps = {
  title?: string;
  subtitle?: string;
  rightExtra?: React.ReactNode;
  showActions?: boolean;
  actions?: React.ReactNode;
  onRefresh?: () => void;
  onAdd?: () => void;
  className?: string;
  style?: React.CSSProperties;
};

export function Header({
  title,
  subtitle,
  rightExtra,
  showActions = true,
  actions,
  onRefresh,
  onAdd,
  className,
  style,
}: HeaderProps) {
  // ✅ default behavior: full tab reload if no custom handler
  const handleRefresh = () => {
    if (onRefresh) onRefresh();
    else window.location.reload();
  };

  return (
    <motion.header
      className={[
        'flex items-center justify-between gap-3 p-4 border-b',
        'bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60',
        'sticky top-0 z-40',
        className || '',
      ].join(' ')}
      style={style}
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      {/* Left side: burger + titles */}
      <div className="flex items-center gap-3 min-w-0">
        <SidebarTrigger />
        <div className="flex flex-col min-w-0">
          {!!title && (
            <h1 className="text-xl font-semibold truncate">{title}</h1>
          )}
          {!!subtitle && (
            <span className="text-xs text-muted-foreground truncate">
              {subtitle}
            </span>
          )}
        </div>
      </div>

      {/* Middle/right: extra controls */}
      <div className="flex items-center gap-2">
        {/* RightExtra (e.g., Online tag + Branch picker) */}
        {!!rightExtra && (
          <div className="flex items-center gap-2">{rightExtra}</div>
        )}

        {/* Action buttons */}
        {actions ? (
          actions
        ) : (
          showActions && (
            <>
              <Button
                size="small"
                onClick={handleRefresh}
                icon={<RefreshCw className="w-4 h-4" />}
              >
                Refresh
              </Button>

            </>
          )
        )}
      </div>
    </motion.header>
  );
}

export default Header;
