from __future__ import annotations

import json
import sys
import zipfile

BOM_ENCODINGS = (
    (b"\xff\xfe", "utf-16-le"),
    (b"\xfe\xff", "utf-16-be"),
    (b"\xef\xbb\xbf", "utf-8-sig"),
)
TEXT_ENCODINGS = ("utf-8", "utf-8-sig", "utf-16", "utf-16-le", "utf-16-be", "gb18030", "gbk")
MAX_TEXT_FILE_BYTES = 512 * 1024
SAMPLE_BYTES = 4096


def looks_binary(raw: bytes) -> bool:
    sample = raw[:SAMPLE_BYTES]
    if any(raw.startswith(marker) for marker, _encoding in BOM_ENCODINGS):
        return False
    if b"\x00" in sample:
        return True
    if not sample:
        return False
    control_bytes = sum(1 for byte in sample if byte < 32 and byte not in (9, 10, 13))
    return control_bytes / len(sample) > 0.30


def decode_text(raw: bytes) -> str | None:
    for marker, encoding in BOM_ENCODINGS:
        if raw.startswith(marker):
            try:
                return raw.decode(encoding)
            except UnicodeDecodeError:
                return None
    for encoding in TEXT_ENCODINGS:
        try:
            return raw.decode(encoding)
        except UnicodeDecodeError:
            continue
    return None


def read_zip_texts(zip_path: str) -> dict[str, str]:
    result: dict[str, str] = {}
    with zipfile.ZipFile(zip_path, "r") as archive:
        for info in archive.infolist():
            if info.is_dir():
                continue
            if info.file_size > MAX_TEXT_FILE_BYTES:
                continue
            try:
                raw = archive.read(info.filename)
            except KeyError:
                continue
            if looks_binary(raw):
                continue
            text = decode_text(raw)
            if text is None:
                continue
            result[info.filename] = text
    return result


def main() -> int:
    if len(sys.argv) != 2:
        print("Usage: python read-zip-example.py <zip-path>", file=sys.stderr)
        return 1

    zip_path = sys.argv[1]
    content_map = read_zip_texts(zip_path)
    print(json.dumps(content_map, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
