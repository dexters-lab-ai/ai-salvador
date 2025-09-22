import clsx from 'clsx';
import { MouseEventHandler, ReactNode } from 'react';

export default function Button(props: {
  className?: string;
  href?: string;
  imgUrl?: string;
  onClick?: MouseEventHandler;
  title?: string;
  children: ReactNode;
}) {
  return (
    <a
      className={clsx(
        'button text-white shadow-solid pointer-events-auto text-xs',
        props.className,
      )}
      href={props.href}
      title={props.title}
      onClick={props.onClick}
    >
      <div className="inline-block bg-clay-700 px-1.5 py-0.5">
        <div className="flex items-center gap-1">
          {props.imgUrl && <img className="w-3 h-3" src={props.imgUrl} />}
          <span>{props.children}</span>
        </div>
      </div>
    </a>
  );
}
