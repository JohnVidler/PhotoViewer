import { useEffect, useRef, useState } from "react";
import { fetchPhotoInfo } from "../api";
import type { PhotoInfo } from "../types";
import { formatBytes, formatDateTime, formatExifDate, formatShutterSpeed } from "../utils";

interface PhotoInfoModalProps {
  photoPath: string;
  /** The photo's mtime; info is re-fetched when the file changes on disk. */
  version: number;
  onClose: () => void;
}

type Field = [label: string, value: string | number | undefined];

interface Section {
  title: string;
  fields: Field[];
}

const ORIENTATIONS: Record<number, string> = {
  1: "Normal",
  2: "Mirrored horizontally",
  3: "Rotated 180°",
  4: "Mirrored vertically",
  5: "Mirrored, rotated 90° CCW",
  6: "Rotated 90° CW",
  7: "Mirrored, rotated 90° CW",
  8: "Rotated 90° CCW",
};

function str(value: unknown): string | undefined {
  return value === undefined ? undefined : String(value);
}

function num(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function yesNo(value: boolean | undefined): string | undefined {
  return value === undefined ? undefined : value ? "Yes" : "No";
}

function buildSections(info: PhotoInfo): Section[] {
  const { file, image, compression, location, metadata: tags } = info;

  const megapixels = image.width && image.height ? (image.width * image.height) / 1_000_000 : undefined;
  const focalLength = num(tags["FocalLength"]);
  const focalLength35 = num(tags["FocalLengthIn35mmFormat"]);
  const exposureTime = num(tags["ExposureTime"]);
  const fNumber = num(tags["FNumber"]);
  const exposureBias = num(tags["ExposureCompensation"]);
  const takenAt = tags["DateTimeOriginal"] ?? tags["CreateDate"];

  return [
    {
      title: "File",
      fields: [
        ["Name", file.name],
        ["Location", file.path],
        ["Type", file.mimeType],
        ["Size", `${formatBytes(file.size)} (${file.size.toLocaleString()} bytes)`],
        ["Modified", formatDateTime(file.modifiedMs)],
        ["Created", file.createdMs > 0 ? formatDateTime(file.createdMs) : undefined],
      ],
    },
    {
      title: "Image",
      fields: [
        ["Format", image.format?.toUpperCase()],
        [
          "Dimensions",
          image.width && image.height ? `${image.width} × ${image.height} px (${megapixels!.toFixed(1)} MP)` : undefined,
        ],
        ["Orientation", image.orientation ? ORIENTATIONS[image.orientation] : undefined],
        ["Colour space", image.colorSpace?.toUpperCase()],
        ["Colour profile", image.iccProfile],
        ["Bit depth", image.bitDepth ? `${image.bitDepth}-bit per channel` : undefined],
        ["Channels", image.channels],
        ["Transparency", yesNo(image.hasAlpha)],
        ["Resolution", image.density ? `${image.density} DPI` : undefined],
        ["Frames / pages", image.pages && image.pages > 1 ? image.pages : undefined],
      ],
    },
    {
      title: "Compression",
      fields: [
        ["Method", compression.method],
        ["Estimated quality", compression.estimatedQuality ? `≈ ${compression.estimatedQuality}%` : undefined],
        ["Chroma subsampling", compression.chromaSubsampling],
        ["Progressive", yesNo(compression.progressive)],
        ["Interlaced", yesNo(compression.interlaced)],
        ["Bits per pixel", compression.bitsPerPixel?.toFixed(2)],
      ],
    },
    {
      title: "Camera",
      fields: [
        ["Make", str(tags["Make"])],
        ["Model", str(tags["Model"])],
        ["Lens", str(tags["LensModel"] ?? tags["Lens"])],
        ["Serial number", str(tags["SerialNumber"] ?? tags["BodySerialNumber"])],
        ["Software", str(tags["Software"])],
      ],
    },
    {
      title: "Exposure",
      fields: [
        ["Taken", typeof takenAt === "string" ? formatExifDate(takenAt) : undefined],
        ["Shutter speed", exposureTime !== undefined ? formatShutterSpeed(exposureTime) : undefined],
        ["Aperture", fNumber !== undefined ? `ƒ/${fNumber}` : undefined],
        ["ISO", str(tags["ISO"])],
        [
          "Focal length",
          focalLength !== undefined
            ? `${focalLength} mm${focalLength35 ? ` (${focalLength35} mm equiv.)` : ""}`
            : undefined,
        ],
        ["Exposure program", str(tags["ExposureProgram"])],
        ["Exposure compensation", exposureBias !== undefined ? `${exposureBias > 0 ? "+" : ""}${exposureBias} EV` : undefined],
        ["Metering", str(tags["MeteringMode"])],
        ["Flash", str(tags["Flash"])],
        ["White balance", str(tags["WhiteBalance"])],
      ],
    },
    {
      title: "Description",
      fields: [
        ["Title", str(tags["title"] ?? tags["ObjectName"])],
        ["Caption", str(tags["ImageDescription"] ?? tags["description"] ?? tags["Caption"])],
        ["Keywords", str(tags["Keywords"] ?? tags["subject"])],
        ["Rating", str(tags["Rating"])],
        ["Artist", str(tags["Artist"] ?? tags["creator"] ?? tags["Byline"])],
        ["Copyright", str(tags["Copyright"] ?? tags["rights"])],
      ],
    },
    {
      title: "Location",
      fields: location
        ? [
            ["Latitude", location.latitude.toFixed(6)],
            ["Longitude", location.longitude.toFixed(6)],
            ["Altitude", location.altitude !== undefined ? `${Math.round(location.altitude)} m` : undefined],
          ]
        : [],
    },
  ]
    .map((section) => ({
      ...section,
      fields: section.fields.filter((field): field is Field => field[1] !== undefined && field[1] !== ""),
    }))
    .filter((section) => section.fields.length > 0);
}

export default function PhotoInfoModal({ photoPath, version, onClose }: PhotoInfoModalProps) {
  const [info, setInfo] = useState<{ path: string; data: PhotoInfo } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);

    fetchPhotoInfo(photoPath, controller.signal)
      .then((data) => setInfo({ path: photoPath, data }))
      .catch(() => {
        if (!controller.signal.aborted) {
          setError("Could not load details for this photo.");
        }
      });

    return () => controller.abort();
  }, [photoPath, version]);

  const current = info?.path === photoPath ? info.data : null;
  const sections = current ? buildSections(current) : [];
  const allTags = current ? Object.entries(current.metadata).sort(([a], [b]) => a.localeCompare(b)) : [];

  return (
    <div className="info-modal" onClick={onClose}>
      <div
        className="info-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="info-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="info-modal__header">
          <h2 id="info-modal-title" className="info-modal__title">
            Details
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            className="viewer__button viewer__button--small"
            onClick={onClose}
            aria-label="Close details"
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6L18 18M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="info-modal__body">
          {error && <p className="info-modal__message info-modal__message--error">{error}</p>}
          {!error && !current && <p className="info-modal__message">Loading…</p>}

          {sections.map((section) => (
            <section key={section.title} className="info-modal__section">
              <h3 className="info-modal__section-title">{section.title}</h3>
              <dl className="info-modal__fields">
                {section.fields.map(([label, value]) => (
                  <div key={label} className="info-modal__field">
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              {section.title === "Location" && current?.location && (
                <a
                  className="info-modal__link"
                  href={`https://www.openstreetmap.org/?mlat=${current.location.latitude}&mlon=${current.location.longitude}#map=15/${current.location.latitude}/${current.location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  View on map ↗
                </a>
              )}
            </section>
          ))}

          {allTags.length > 0 && (
            <details className="info-modal__section info-modal__all">
              <summary className="info-modal__section-title">All metadata ({allTags.length} tags)</summary>
              <dl className="info-modal__fields">
                {allTags.map(([key, value]) => (
                  <div key={key} className="info-modal__field">
                    <dt>{key}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </details>
          )}

          {current && allTags.length === 0 && (
            <p className="info-modal__message">No EXIF or other embedded metadata in this file.</p>
          )}
        </div>
      </div>
    </div>
  );
}
