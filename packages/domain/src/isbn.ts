function stripIsbn(value: string): string {
  return value.replace(/[\s-]/g, "");
}

function computeIsbn13Check(digits: string): number {
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = parseInt(digits[i]!, 10);
    sum += i % 2 === 0 ? d : d * 3;
  }
  const rem = sum % 10;
  return rem === 0 ? 0 : 10 - rem;
}

function computeIsbn10Check(digits: string): string {
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(digits[i]!, 10) * (10 - i);
  }
  const rem = (11 - (sum % 11)) % 11;
  return rem === 10 ? "X" : String(rem);
}

function isbn10ToIsbn13(isbn10: string): string {
  const body = "978" + isbn10.slice(0, 9);
  const check = computeIsbn13Check(body);
  return body + String(check);
}

export function normalizeIsbn(value: string): string {
  const stripped = stripIsbn(value).toUpperCase();

  if (stripped.length === 13) {
    const digits = stripped;
    if (!/^\d{13}$/.test(digits)) {
      throw new Error(`Invalid ISBN-13: ${value}`);
    }
    const expected = computeIsbn13Check(digits.slice(0, 12));
    if (parseInt(digits[12]!, 10) !== expected) {
      throw new Error(`Invalid ISBN-13 checksum: ${value}`);
    }
    return digits;
  }

  if (stripped.length === 10) {
    const digits = stripped;
    if (!/^\d{9}[\dX]$/.test(digits)) {
      throw new Error(`Invalid ISBN-10: ${value}`);
    }
    const expected = computeIsbn10Check(digits);
    if (digits[9] !== expected) {
      throw new Error(`Invalid ISBN-10 checksum: ${value}`);
    }
    return isbn10ToIsbn13(digits);
  }

  throw new Error(`Invalid ISBN length: ${value}`);
}
