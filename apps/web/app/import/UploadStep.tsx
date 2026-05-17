"use client";

import { useCallback, useRef } from "react";

export interface UploadStepProps {
  /** Disabled while the previous step is still in flight. */
  busy?: boolean;
  /** Called once the user picks a `.csv` file. */
  onFilePicked: (file: File) => void;
}

/**
 * Step 1 of the import flow — a single `.csv` file picker.
 *
 * Kept presentational: ImportFlow owns the state machine and decides
 * when to advance. We accept only `.csv` via the file input `accept`
 * attribute and re-check the extension client-side so a drag-drop
 * "all files" picker can't slip a non-CSV through (browsers honour
 * `accept` as a hint, not a hard filter).
 */
export function UploadStep({ busy = false, onFilePicked }: UploadStepProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      onFilePicked(file);
      // Reset so picking the same file twice in a row still fires onChange.
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFilePicked],
  );

  return (
    <div className="importUploadStep" data-testid="import-upload-step">
      <h2 className="importStepTitle">Upload your Goodreads CSV</h2>
      <p className="importStepDescription">
        Export your library from Goodreads (My Books &rarr; Import / Export
        &rarr; Export library) and pick the resulting <code>.csv</code> file
        below.
      </p>
      <label className="importFilePickerLabel" htmlFor="import-csv-input">
        Choose a file
      </label>
      <input
        ref={inputRef}
        id="import-csv-input"
        className="importFilePickerInput"
        type="file"
        accept=".csv,text/csv"
        onChange={handleChange}
        disabled={busy}
        data-testid="import-csv-input"
      />
    </div>
  );
}
