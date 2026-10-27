"""Generate ignored, synthetic files used by the real browser/API tests."""
from pathlib import Path

from tests.document_factory import make_docx, make_pdf


def main():
    directory = Path(__file__).resolve().parents[1] / ".test-fixtures"
    directory.mkdir(exist_ok=True)
    files = {
        "synthetic.pdf": make_pdf(),
        "synthetic.docx": make_docx(),
        "review.docx": make_docx("Synthetic Candidate 😀\nProfile\nExperiance in reporting and data analysis.\nSkills\nPython, SQL\nWork experience\nBuilt a reporting dashboard.\nManaged the the monthly reporting pack."),
        "damaged.pdf": b"%PDF-1.7\nnot a valid document",
        "damaged.docx": b"PK\x03\x04not a valid document",
        "empty.pdf": b"",
        "empty.docx": b"",
        "blank.docx": make_docx(""),
        "scanned.pdf": make_pdf(image_only=True),
        "encrypted.pdf": make_pdf(encrypted=True),
        "too-many-pages.pdf": make_pdf(pages=31),
        "unsupported.txt": b"Synthetic text only",
    }
    for name, content in files.items():
        (directory / name).write_bytes(content)
    print(f"Generated {len(files)} synthetic fixtures.")


if __name__ == "__main__":
    main()
