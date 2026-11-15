import { useState, type FormEvent } from "react";
import { setAlbumDescription } from "../api";

const MAX_LENGTH = 2000;

interface AlbumDescriptionProps {
  /** The album's path as the client names it (may be a ".shared/12" one). */
  path: string;
  description: string | undefined;
  /** The visitor may add or change the description. */
  editable: boolean;
}

/** The album's description at the top of the page, with an inline editor for anyone who can change the album. */
export default function AlbumDescription({ path, description, editable }: AlbumDescriptionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    if (!description && !editable) {
      return null;
    }
    return (
      <div className="album-description">
        {description ? <p className="album-description__text">{description}</p> : null}
        {editable && (
          <button
            type="button"
            className="album-description__edit"
            onClick={() => {
              setDraft(description ?? "");
              setError(null);
              setEditing(true);
            }}
          >
            {description ? "Edit description" : "Add a description"}
          </button>
        )}
      </div>
    );
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await setAlbumDescription(path, draft);
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not save the description.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="album-description" onSubmit={(event) => void save(event)}>
      <textarea
        className="album-description__input"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        maxLength={MAX_LENGTH}
        rows={4}
        placeholder="Describe this album…"
        aria-label="Album description"
        autoFocus
      />
      {error && <div className="state-message state-message--error">{error}</div>}
      <div className="album-description__actions">
        <button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
