import type { ReactNode } from 'react';
export function Frame({children,className='',tone='gold'}:{children:ReactNode,className?:string;tone?:'gold'|'green'|'coral'|'navy'}) {
  return <div className={`ornate-frame tone-${tone} ${className}`}><span className="corner tl"/><span className="corner tr"/><span className="corner bl"/><span className="corner br"/>{children}</div>;
}
export function Sparkle({className=''}:{className?:string}) { return <span className={`brand-sparkle ${className}`}>✦</span>; }
