"""Local extraction. Uploaded content is neither persisted nor logged here."""

from io import BytesIO
from pathlib import PurePosixPath
from zipfile import ZipFile

import pymupdf
from docx import Document
from docx.oxml.ns import qn
from lxml import etree

# Native parser diagnostics can contain fragments of untrusted input.
pymupdf.TOOLS.mupdf_display_errors(False)
pymupdf.TOOLS.mupdf_display_warnings(False)

MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_PDF_PAGES = 30
MAX_DOCX_PAGES = 30
MAX_UNCOMPRESSED_SIZE = 20 * 1024 * 1024
MAX_ZIP_ENTRIES = 1000
MAX_TEXT_CHARACTERS = 500_000


class DocumentValidationError(ValueError):
    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def safe_filename(filename: str) -> str:
    return PurePosixPath(filename.replace("\\", "/")).name


def _pdf_text(content: bytes) -> str:
    if not content.startswith(b"%PDF-"):
        raise DocumentValidationError("This file is not a valid PDF document.")
    with pymupdf.open(stream=content, filetype="pdf") as pdf:
        if not pdf.is_pdf:
            raise DocumentValidationError("This file is not a valid PDF document.")
        if pdf.is_encrypted:
            raise DocumentValidationError(
                "Password-protected PDFs are not supported. Upload an unlocked copy."
            )
        if len(pdf) > MAX_PDF_PAGES:
            raise DocumentValidationError("The PDF must contain 30 pages or fewer.")
        pages = []
        total = 0
        for page in pdf:
            text = page.get_text(sort=True)
            total += len(text) + (1 if pages else 0)
            if total > MAX_TEXT_CHARACTERS:
                raise DocumentValidationError("This document contains too much text to process.")
            pages.append(text)
        text = "\n".join(pages).strip()
        if not text:
            raise DocumentValidationError(
                "No readable text found. Scanned or image-only PDFs need OCR before uploading."
            )
        return text


def _docx_text(content: bytes) -> str:
    if not content.startswith(b"PK\x03\x04"):
        raise DocumentValidationError("This file is not a valid DOCX document.")
    with ZipFile(BytesIO(content)) as archive:
        entries = archive.infolist()
        if (
            len(entries) > MAX_ZIP_ENTRIES
            or sum(entry.file_size for entry in entries) > MAX_UNCOMPRESSED_SIZE
        ):
            raise DocumentValidationError("The DOCX expands beyond the safe processing limit.")
        if any(entry.flag_bits & 1 for entry in entries):
            raise DocumentValidationError("Password-protected documents are not supported.")
        if len({entry.filename for entry in entries}) != len(entries):
            raise DocumentValidationError("This DOCX contains an invalid archive structure.")
        if not {"[Content_Types].xml", "word/document.xml"}.issubset(archive.namelist()):
            raise DocumentValidationError("This file is not a valid DOCX document.")
        # DOCX has no fixed pagination. Validate cached metadata and explicit
        # page breaks; exact rendered pagination requires Word/LibreOffice.
        if "docProps/app.xml" in archive.namelist():
            properties = etree.fromstring(
                archive.read("docProps/app.xml"),
                etree.XMLParser(resolve_entities=False, no_network=True),
            )
            declared_pages = properties.find(
                "{http://schemas.openxmlformats.org/officeDocument/2006/extended-properties}Pages"
            )
            if declared_pages is not None and declared_pages.text:
                try:
                    pages = int(declared_pages.text)
                except ValueError as exc:
                    raise DocumentValidationError("This DOCX contains invalid page metadata.") from exc
                if pages < 0:
                    raise DocumentValidationError("This DOCX contains invalid page metadata.")
                if pages > MAX_DOCX_PAGES:
                    raise DocumentValidationError("The DOCX must declare 30 pages or fewer.")

    document = Document(BytesIO(content))
    explicit_breaks = sum(
        1 for element in document.element.iter(qn("w:br"))
        if element.get(qn("w:type")) == "page"
    )
    explicit_breaks += sum(
        1 for element in document.element.iter(qn("w:pageBreakBefore"))
        if element.get(qn("w:val"), "true") not in {"0", "false", "off"}
    )
    if explicit_breaks + 1 > MAX_DOCX_PAGES:
        raise DocumentValidationError("The DOCX must contain 30 pages or fewer based on explicit page breaks.")

    # Iterating paragraphs preserves document order and includes nested tables.
    parts = [document.element.body]
    seen_parts = set()
    for section in document.sections:
        for container in (
            section.header, section.first_page_header, section.even_page_header,
            section.footer, section.first_page_footer, section.even_page_footer,
        ):
            if container.part.partname not in seen_parts:
                parts.append(container._element)
                seen_parts.add(container.part.partname)
    paragraphs = []
    total = 0
    for part in parts:
        for paragraph in part.iter(qn("w:p")):
            fragments = []
            for element in paragraph.iter():
                if element.tag == qn("w:t"):
                    fragments.append(element.text or "")
                elif element.tag == qn("w:tab"):
                    fragments.append("\t")
                elif element.tag == qn("w:br"):
                    fragments.append("\n")
            text = "".join(fragments)
            total += len(text) + (1 if paragraphs else 0)
            if total > MAX_TEXT_CHARACTERS:
                raise DocumentValidationError("This document contains too much text to process.")
            if text.strip():
                paragraphs.append(text.strip())
    text = "\n".join(paragraphs).strip()
    if not text:
        raise DocumentValidationError("No readable text found in this DOCX. Add document text before uploading.")
    return text


def extract_cv_text(filename: str, content: bytes) -> str:
    extension = PurePosixPath(safe_filename(filename)).suffix.lower()
    if extension not in {".pdf", ".docx"}:
        raise DocumentValidationError("Only PDF and DOCX files are supported.")
    if not content:
        raise DocumentValidationError("The uploaded file is empty.")
    if len(content) > MAX_FILE_SIZE:
        raise DocumentValidationError("The file must be 5 MB or smaller.", status_code=413)
    try:
        return _pdf_text(content) if extension == ".pdf" else _docx_text(content)
    except DocumentValidationError:
        raise
    except Exception as exc:
        # Never expose parser diagnostics or document contents to clients.
        raise DocumentValidationError(
            "Unable to read this document. It may be invalid or damaged; "
            "export a new PDF or DOCX and try again."
        ) from exc
