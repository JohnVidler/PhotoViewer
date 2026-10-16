import { useEffect, useState } from "react";

interface Tick {
  id: string;
  label: string;
  /** Position down the page, 0..1. */
  fraction: number;
}

interface DateRailProps {
  /** Class name carried by each day heading element, which must also have `id` and `data-label`. */
  markerSelector: string;
}

/**
 * A strip alongside the browser scrollbar marking where each day starts, with the day
 * currently in view highlighted. Clicking a tick jumps to that day.
 */
export default function DateRail({ markerSelector }: DateRailProps) {
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollFraction, setScrollFraction] = useState(0);

  useEffect(() => {
    const measure = () => {
      const pageHeight = document.documentElement.scrollHeight;
      const markers = Array.from(document.querySelectorAll<HTMLElement>(markerSelector));
      setTicks(
        markers.map((marker) => ({
          id: marker.id,
          label: marker.dataset.label ?? "",
          fraction: (marker.getBoundingClientRect().top + window.scrollY) / pageHeight,
        })),
      );
    };

    const update = () => {
      const pageHeight = document.documentElement.scrollHeight;
      setScrollFraction(window.scrollY / pageHeight);

      // The active day is the last one whose heading has reached the top of the viewport.
      let current: string | null = null;
      for (const marker of document.querySelectorAll<HTMLElement>(markerSelector)) {
        if (marker.getBoundingClientRect().top > 80) {
          break;
        }
        current = marker.id;
      }
      setActiveId(current);
    };

    measure();
    update();

    // Thumbnails loading and the window resizing both change the page height.
    const observer = new ResizeObserver(() => {
      measure();
      update();
    });
    observer.observe(document.body);
    window.addEventListener("scroll", update, { passive: true });

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", update);
    };
  }, [markerSelector]);

  if (ticks.length < 2) {
    return null;
  }

  return (
    <nav className="date-rail" aria-label="Jump to date">
      <span className="date-rail__position" style={{ top: `${scrollFraction * 100}%` }} aria-hidden="true" />
      {ticks.map((tick) => (
        <button
          key={tick.id}
          type="button"
          className={`date-rail__tick${tick.id === activeId ? " date-rail__tick--active" : ""}`}
          style={{ top: `${tick.fraction * 100}%` }}
          aria-label={tick.label}
          onClick={() => document.getElementById(tick.id)?.scrollIntoView({ behavior: "smooth", block: "start" })}
        >
          <span className="date-rail__label">{tick.label}</span>
        </button>
      ))}
    </nav>
  );
}
