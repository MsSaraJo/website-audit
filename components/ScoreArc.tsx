export function ScoreArc({score=0,label='Overall score',tone='navy'}:{score?:number|null;label?:string;tone?:'navy'|'coral'|'green'|'gold'}) {
  const pct = Math.max(0,Math.min(100,score ?? 0));
  return <div className={`score-arc score-${tone}`} style={{'--score':`${pct*2.45}deg`} as React.CSSProperties}>
    <div className="arc-ring"/><span className="score-value">{score ?? '—'}</span><span className="arc-star">✦</span><small>{label}</small>
  </div>;
}
