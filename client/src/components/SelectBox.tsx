interface SelectBoxProps {
  checked: boolean;
  /** Name of the photo or album, for screen readers. */
  label: string;
  onToggle: () => void;
}

/** The small tick box in the top-left corner of a tile. Shown on hover, and always once anything is ticked. */
export default function SelectBox({ checked, label, onToggle }: SelectBoxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={`Select ${label}`}
      className="select-box"
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M6 12.5L10.5 17L18 8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
