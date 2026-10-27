import pytest
import document_parser

from document_parser import MAX_FILE_SIZE, MAX_UNCOMPRESSED_SIZE, extract_cv_text
from tests.document_factory import SAMPLE_TEXT, make_docx, make_pdf, rewrite_zip, with_declared_pages


def test_extracts_docx_text():
    result = extract_cv_text("sample.docx", make_docx("Python and data analysis"))
    assert "Python and data analysis" in result


def test_rejects_unsupported_extension():
    with pytest.raises(ValueError, match="Only PDF and DOCX"):
        extract_cv_text("sample.txt", b"hello")


def test_rejects_empty_file():
    with pytest.raises(ValueError, match="empty"):
        extract_cv_text("sample.docx", b"")


def test_rejects_non_document_content():
    with pytest.raises(ValueError):
        extract_cv_text("sample.docx", b"not a docx file")


@pytest.mark.parametrize("filename,factory", [("CV.PDF", make_pdf), ("CV.DOCX", make_docx)])
def test_extracts_text_and_accepts_case_insensitive_extensions(filename, factory):
    assert extract_cv_text(filename, factory()) == SAMPLE_TEXT


def test_docx_includes_tables_in_order_and_headers_and_footers():
    text = extract_cv_text("cv.docx", make_docx(table=True, headers=True))
    assert text.index("Table skill") < text.index("Nested table") < text.index("After table")
    assert "Synthetic header" in text and "Synthetic footer" in text


@pytest.mark.parametrize("extension", ["pdf", "docx"])
def test_rejects_file_over_size_limit(extension):
    with pytest.raises(ValueError, match="5 MB"):
        extract_cv_text(f"cv.{extension}", b"x" * (MAX_FILE_SIZE + 1))


def test_rejects_renamed_pdf_as_docx_and_docx_as_pdf():
    for filename, content in [("cv.docx", make_pdf()), ("cv.pdf", make_docx())]:
        with pytest.raises(ValueError, match="not a valid"):
            extract_cv_text(filename, content)


@pytest.mark.parametrize("content", [b"%PDF-1.7\ngarbage", b"PK\x03\x04garbage"])
def test_rejects_corrupt_documents_with_generic_errors(content):
    extension = "pdf" if content.startswith(b"%PDF") else "docx"
    with pytest.raises(ValueError, match="invalid or damaged"):
        extract_cv_text(f"cv.{extension}", content)


def test_rejects_encrypted_pdf():
    with pytest.raises(ValueError, match="Password-protected"):
        extract_cv_text("cv.pdf", make_pdf(encrypted=True))


def test_rejects_pdf_over_page_limit():
    with pytest.raises(ValueError, match="30 pages"):
        extract_cv_text("cv.pdf", make_pdf(pages=31))


def test_accepts_pdf_at_page_limit():
    assert extract_cv_text("cv.pdf", make_pdf(pages=30)).count("Synthetic CV") == 30


@pytest.mark.parametrize("content", [make_pdf(text=""), make_pdf(image_only=True)], ids=["blank", "image-only"])
def test_no_pdf_text_explains_ocr(content):
    with pytest.raises(ValueError, match="OCR"):
        extract_cv_text("cv.pdf", content)


def test_rejects_docx_without_text():
    with pytest.raises(ValueError, match="No readable text"):
        extract_cv_text("cv.docx", make_docx(" \n\t"))


@pytest.mark.parametrize("pages", [31, 100])
def test_docx_declared_page_limit(pages):
    with pytest.raises(ValueError, match="30 pages"):
        extract_cv_text("cv.docx", with_declared_pages(make_docx(), pages))


@pytest.mark.parametrize("pages", ["invalid", -1])
def test_rejects_invalid_page_metadata(pages):
    with pytest.raises(ValueError, match="invalid page metadata"):
        extract_cv_text("cv.docx", with_declared_pages(make_docx(), pages))


def test_docx_explicit_page_limit():
    with pytest.raises(ValueError, match="30 pages"):
        extract_cv_text("cv.docx", make_docx(page_breaks=30))


def test_rejects_docx_expansion_bomb():
    content = rewrite_zip(make_docx(), "word/document.xml", b"x" * (MAX_UNCOMPRESSED_SIZE + 1))
    assert len(content) < MAX_FILE_SIZE
    with pytest.raises(ValueError, match="safe processing limit"):
        extract_cv_text("cv.docx", content)


def test_rejects_malformed_docx_xml():
    content = rewrite_zip(make_docx(), "word/document.xml", b"<not-closed>")
    with pytest.raises(ValueError, match="invalid or damaged"):
        extract_cv_text("cv.docx", content)


def test_accepts_unicode_docx():
    assert extract_cv_text("cv.docx", make_docx("Synthetic José — 数据分析 😀")) == "Synthetic José — 数据分析 😀"


@pytest.mark.parametrize("extension,factory", [("pdf", make_pdf), ("docx", make_docx)])
def test_extracted_text_limit(extension, factory, monkeypatch):
    monkeypatch.setattr(document_parser, "MAX_TEXT_CHARACTERS", 20)
    with pytest.raises(ValueError, match="too much text"):
        extract_cv_text(f"cv.{extension}", factory())
