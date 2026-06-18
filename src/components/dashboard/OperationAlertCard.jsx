import { memo } from 'react';

function OperationAlertCard({ data }) {
  return (
    <section className="dashboard-card compact-card">
      <div className="card-header">
        <h2>Top đơn vị theo doanh số</h2>
        <p>Xếp hạng theo số tiền giải ngân của các đơn vị</p>
      </div>

      <div className="alert-list">
        {data.map((item) => (
          <div className="alert-row" key={`${item.title}-${item.value}`}>
            <span className={`alert-tag tag-${item.tone}`}>{item.tag}</span>
            <strong>{item.title}</strong>
            <span>{item.value}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default memo(OperationAlertCard);
