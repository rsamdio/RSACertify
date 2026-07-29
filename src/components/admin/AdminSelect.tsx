"use client";

import { CSSProperties, useEffect, useId, useRef, useState } from "react";

export type AdminSelectOption = {
  value: string;
  label: string;
  style?: CSSProperties;
};

type AdminSelectProps = {
  id?: string;
  value: string;
  options: AdminSelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  compact?: boolean;
  "aria-label"?: string;
};

export function AdminSelect({
  id,
  value,
  options,
  onChange,
  disabled,
  compact,
  "aria-label": ariaLabel
}: AdminSelectProps) {
  const autoId = useId();
  const triggerId = id || autoId;
  const listId = `${triggerId}-list`;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const selected = options.find((o) => o.value === value) || options[0];
  const selectedValue = selected?.value || value;

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(next: string) {
    onChange(next);
    setOpen(false);
  }

  return (
    <div
      className={`admin-select${compact ? " is-compact" : ""}${open ? " is-open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        id={triggerId}
        className="admin-select-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        disabled={disabled || options.length === 0}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="admin-select-value" style={selected?.style}>
          {selected?.label || "Select…"}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        <ul id={listId} className="admin-select-menu" role="listbox" aria-labelledby={triggerId}>
          {options.map((option) => {
            const isSelected = option.value === selectedValue;
            return (
              <li key={option.value} role="presentation">
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  className={`admin-select-option${isSelected ? " is-selected" : ""}`}
                  style={option.style}
                  onClick={() => pick(option.value)}
                >
                  {option.label}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
