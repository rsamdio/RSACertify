"use client";

import { useEffect, useId, useRef, useState } from "react";

type DateFieldProps = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDisplay(value: string): string {
  const d = parseISODate(value);
  if (!d) return "";
  return d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function DateField({ id, value, onChange, disabled }: DateFieldProps) {
  const autoId = useId();
  const inputId = id || autoId;
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = parseISODate(value);
  const [viewYear, setViewYear] = useState(() => (selected || new Date()).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => (selected || new Date()).getMonth());

  useEffect(() => {
    const next = parseISODate(value);
    if (next) {
      setViewYear(next.getFullYear());
      setViewMonth(next.getMonth());
    }
  }, [value]);

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

  const firstDow = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: Array<number | null> = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1)
  ];
  const today = new Date();
  const monthLabel = new Date(viewYear, viewMonth, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric"
  });

  function shiftMonth(delta: number) {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  }

  function pickDay(day: number) {
    onChange(toISODate(new Date(viewYear, viewMonth, day)));
    setOpen(false);
  }

  return (
    <div className="date-field" ref={rootRef}>
      <button
        type="button"
        id={inputId}
        className="date-field-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={value ? undefined : "date-field-placeholder"}>
          {value ? formatDisplay(value) : "Select date"}
        </span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8 3.5v3M16 3.5v3M3.5 9.5h17" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
      </button>
      {open ? (
        <div className="date-field-popover" role="dialog" aria-label="Choose date">
          <div className="date-field-nav">
            <button type="button" className="date-field-nav-btn" onClick={() => shiftMonth(-1)} aria-label="Previous month">
              ‹
            </button>
            <strong>{monthLabel}</strong>
            <button type="button" className="date-field-nav-btn" onClick={() => shiftMonth(1)} aria-label="Next month">
              ›
            </button>
          </div>
          <div className="date-field-weekdays">
            {WEEKDAYS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="date-field-grid">
            {cells.map((day, i) => {
              if (day == null) return <span key={`e-${i}`} className="date-field-empty" />;
              const date = new Date(viewYear, viewMonth, day);
              const isSelected = selected ? sameDay(selected, date) : false;
              const isToday = sameDay(today, date);
              return (
                <button
                  key={day}
                  type="button"
                  className={`date-field-day${isSelected ? " is-selected" : ""}${isToday ? " is-today" : ""}`}
                  onClick={() => pickDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
          <div className="date-field-footer">
            <button
              type="button"
              className="link-action"
              onClick={() => {
                onChange(toISODate(new Date()));
                setOpen(false);
              }}
            >
              Today
            </button>
            {value ? (
              <button
                type="button"
                className="link-action"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
