import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UploadStep } from "./UploadStep";

describe("UploadStep (K-07, #106)", () => {
  it("renders a file input that accepts CSV", () => {
    const html = renderToStaticMarkup(
      <UploadStep onFilePicked={() => {}} />,
    );
    expect(html).toContain('data-testid="import-csv-input"');
    expect(html).toContain('type="file"');
    expect(html).toContain('accept=".csv,text/csv"');
  });

  it("labels the input for screen readers", () => {
    const html = renderToStaticMarkup(
      <UploadStep onFilePicked={() => {}} />,
    );
    expect(html).toContain('for="import-csv-input"');
    expect(html).toContain("Choose a file");
  });

  it("disables the input while busy=true", () => {
    const html = renderToStaticMarkup(
      <UploadStep onFilePicked={() => {}} busy={true} />,
    );
    expect(html).toContain("disabled");
  });

  it("renders a Goodreads-specific call-to-action in the description", () => {
    const html = renderToStaticMarkup(
      <UploadStep onFilePicked={() => {}} />,
    );
    expect(html).toMatch(/Goodreads/i);
    expect(html).toContain(".csv");
  });
});
