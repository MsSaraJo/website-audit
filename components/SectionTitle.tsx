import { Sparkle } from './Frame';
export function SectionTitle({eyebrow,title,script,body}:{eyebrow?:string;title:string;script?:string;body?:string}) {
 return <div className="page-heading">{eyebrow&&<span className="page-eyebrow">{eyebrow}</span>}<h1>{title}</h1>{script&&<div className="script-line"><i/><Sparkle/><em>{script}</em><Sparkle/><i/></div>}{body&&<p>{body}</p>}</div>;
}
