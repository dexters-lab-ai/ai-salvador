import clsx from 'clsx';
import { MouseEventHandler, ReactNode } from 'react';

export default function Button({
  className,
  href,
  imgUrl,
  onClick,
  title,
  children,
  disabled = false,
}: {
  className?: string;
  href?: string;
  imgUrl?: string;
  onClick?: MouseEventHandler;
  title?: string;
  children: ReactNode;
  disabled?: boolean;
}) {
  const handleClick: MouseEventHandler = (e) => {
    if (disabled) {
      e.preventDefault();
      return;
    }
    onClick?.(e);
  };

  return (
    <a
      className={clsx(
        'button text-white shadow-solid pointer-events-auto text-xs',
        disabled && 'opacity-50 cursor-not-allowed',
        className,
      )}
      href={disabled ? undefined : href}
      title={title}
      onClick={handleClick}
      aria-disabled={disabled}
      style={disabled ? { pointerEvents: 'none' } : {}}
    >
      <div className="inline-block bg-clay-700 px-1.5 py-0.5">
        <div className="flex items-center gap-1">
          {imgUrl && <img className="w-3 h-3" src={imgUrl} alt="" />}
          <span>{children}</span>
        </div>
      </div>
    </a>
  );
}
