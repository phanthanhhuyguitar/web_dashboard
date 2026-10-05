import { useEffect, useRef, useState } from 'react';

// Thay cho <select> native - trinh duyet KHONG cho style phan popup xoe ra (border-radius,
// mau hover...) nen luon bi "lac theme" nhu anh chup man hinh. Component nay tu dung popover
// rieng, dong bo giao dien voi phan con lai cua app. onChange tra ve dang { target: { name,
// value } } giong native event, de cac handler dang viet cho <select> (vd updateFilter trong
// OrgUnitUsersPanel) dung lai duoc nguyen ven, chi can doi tag.
function ThemedSelect({ name, value, options, onChange, disabled = false, placeholder = 'Chọn', className = '', ariaLabel }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);

    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const selectedOption = options.find((option) => option.value === value);

  function handleSelect(optionValue) {
    setOpen(false);
    onChange({ target: { name, value: optionValue } });
  }

  return (
    <div className={`ds-select${open ? ' is-open' : ''}${disabled ? ' is-disabled' : ''}${className ? ` ${className}` : ''}`} ref={rootRef}>
      <button
        type="button"
        className="ds-select-trigger"
        onClick={() => !disabled && setOpen((current) => !current)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <span className="ds-select-value">{selectedOption?.label ?? placeholder}</span>
        <span className="ds-select-caret" aria-hidden="true">⌄</span>
      </button>

      {open ? (
        <ul className="ds-select-options" role="listbox">
          {options.map((option) => (
            <li key={option.value || 'all'}>
              <button
                className={`ds-select-option${option.value === value ? ' is-selected' : ''}`}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => handleSelect(option.value)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export default ThemedSelect;
