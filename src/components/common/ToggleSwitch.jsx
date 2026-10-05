// Cong tac bat/tat dung chung (dung o trang Cai dat va co the tai su dung sau nay).
function ToggleSwitch({ checked, onChange, label, disabled = false }) {
  return (
    <button
      className={`ds-switch${checked ? ' is-on' : ''}`}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="ds-switch-track">
        <span className="ds-switch-thumb" />
      </span>
    </button>
  );
}

export default ToggleSwitch;
