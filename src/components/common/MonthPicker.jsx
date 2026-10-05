import { useState } from 'react';

import ThemedSelect from './ThemedSelect.jsx';

const MONTH_OPTIONS = [
  'Tháng 1',
  'Tháng 2',
  'Tháng 3',
  'Tháng 4',
  'Tháng 5',
  'Tháng 6',
  'Tháng 7',
  'Tháng 8',
  'Tháng 9',
  'Tháng 10',
  'Tháng 11',
  'Tháng 12',
];

function getYearOptions(selectedYear) {
  const currentYear = new Date().getFullYear();
  const years = new Set([selectedYear]);

  for (let year = currentYear - 3; year <= currentYear + 2; year++) {
    years.add(year);
  }

  return Array.from(years).sort((a, b) => b - a);
}

function getInitialPickerYear(value) {
  const year = Number(String(value || '').slice(0, 4));

  return Number.isFinite(year) && year > 0 ? year : new Date().getFullYear();
}

function MonthPicker({ value, onChange, label, placeholder = 'Chọn tháng', ariaLabel = 'Chọn tháng' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pickerYear, setPickerYear] = useState(() => getInitialPickerYear(value));

  const handleSelect = (monthIndex) => {
    const month = String(monthIndex + 1).padStart(2, '0');

    onChange(`${pickerYear}-${month}`);
    setIsOpen(false);
  };

  return (
    <div className="period-picker-wrap">
      <button
        className="period-picker"
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
      >
        <span>{label || placeholder}</span>
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="m5.5 7.5 4.5 4.5 4.5-4.5" />
        </svg>
      </button>

      {isOpen ? (
        <div className="month-picker-popover" role="dialog" aria-label={ariaLabel}>
          <div className="month-picker-header">
            <span>Chọn tháng</span>
            <ThemedSelect
              className="month-picker-year-select"
              value={String(pickerYear)}
              options={getYearOptions(pickerYear).map((year) => ({ value: String(year), label: String(year) }))}
              onChange={(event) => setPickerYear(Number(event.target.value))}
              ariaLabel="Chọn năm"
            />
          </div>

          <div className="month-picker-grid">
            {MONTH_OPTIONS.map((monthLabel, index) => {
              const monthValue = `${pickerYear}-${String(index + 1).padStart(2, '0')}`;
              const isSelected = monthValue === value;

              return (
                <button
                  className={`month-picker-option${isSelected ? ' is-selected' : ''}`}
                  type="button"
                  onClick={() => handleSelect(index)}
                  key={monthLabel}
                >
                  {monthLabel}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default MonthPicker;
