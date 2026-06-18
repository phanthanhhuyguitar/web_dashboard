import { memo } from 'react';

const iconMap = {
  loans: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 4.75h10a1.75 1.75 0 0 1 1.75 1.75v11A1.75 1.75 0 0 1 17 19.25H7A1.75 1.75 0 0 1 5.25 17.5v-11A1.75 1.75 0 0 1 7 4.75Z" />
      <path d="M8.75 8.25h6.5M8.75 12h6.5M8.75 15.75h3.5" />
    </svg>
  ),
  success: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m6.75 12.25 3.35 3.35 7.15-7.2" />
    </svg>
  ),
  revenue: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.75v14.5M8 8.25h5.25a2.75 2.75 0 0 1 0 5.5H9.5M8 13.75h6.25a2.75 2.75 0 0 1 0 5.5H8" />
    </svg>
  ),
  active: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 5.25 20.25 18.5H3.75L12 5.25Z" />
      <path d="M12 10v4.25M12 16.75h.01" />
    </svg>
  ),
  commission: (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 4.75 19.25 12 12 19.25 4.75 12 12 4.75Z" />
      <path d="M12 8.75v6.5M8.75 12h6.5" />
    </svg>
  ),
};

const trendToneMap = {
  up: 'up',
  down: 'down',
  neutral: 'neutral',
  new: 'new',
};

function KpiCard({ item }) {
  const changeDisplay = typeof item.change === 'object' ? item.change.display : item.change;
  const changeTone = typeof item.change === 'object' ? trendToneMap[item.change.trend] || 'neutral' : item.changeTone;

  return (
    <article className="kpi-card">
      <div className={`kpi-icon tone-${item.changeTone}`}>{iconMap[item.iconType]}</div>
      <div className="kpi-content">
        <p>{item.label}</p>
        <div className="kpi-value-row">
          <strong>{item.value}</strong>
          <span className={`kpi-change kpi-change-${changeTone}`}>{changeDisplay}</span>
        </div>
        <span>{item.description}</span>
      </div>
    </article>
  );
}

export default memo(KpiCard);
