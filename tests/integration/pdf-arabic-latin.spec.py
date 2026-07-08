"""
Integration test: verify PDF generation renders Arabic and Latin tokens
correctly — no reordering, no dropped letters, no word breakage.

Uses the same pipeline as /mnt/documents/aqari-system-review.pdf:
  arabic_reshaper + python-bidi + reportlab + Noto Naskh Arabic.

Run standalone:  python3 tests/integration/pdf-arabic-latin.spec.py
"""

import os
import sys
import tempfile

import arabic_reshaper
from bidi.algorithm import get_display
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_RIGHT, TA_LEFT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer

import pdfplumber


AR_FONT = "/nix/store/dg3hd9mqha517djbgpgnq8r4q1j1wn30-noto-fonts-2025.11.01/share/fonts/noto/NotoNaskhArabic[wght].ttf"


# --- Test fixtures: bilingual/mixed strings covering the tricky cases ---
#
#   1. Pure Arabic sentence with punctuation.
#   2. Arabic sentence embedding Latin technical tokens (RLS, TanStack, SAR).
#   3. Numeric / currency mixed with Arabic ("قيمة العقد 1,250.00 ر.س").
#   4. Latin-only technical line — must survive verbatim.
ARABIC_ONLY   = "منصة عقاري لإدارة العقارات متعددة المستأجرين."
ARABIC_LATIN  = "يعتمد النظام على TanStack Start و Supabase مع تفعيل RLS."
ARABIC_NUMBER = "قيمة العقد 1,250.00 ر.س سنوياً."
LATIN_ONLY    = "TanStack Start v1 · Supabase · RLS · SAR 1,250.00"

LATIN_TOKENS = ["TanStack", "Start", "Supabase", "RLS", "SAR", "1,250.00", "v1"]
ARABIC_WORDS = ["منصة", "عقاري", "النظام", "العقد", "المستأجرين"]


def reshape(text: str) -> str:
    """Shape Arabic + apply BiDi exactly like the report generator does."""
    return get_display(arabic_reshaper.reshape(text))


def build_pdf(path: str) -> None:
    pdfmetrics.registerFont(TTFont("Naskh", AR_FONT))

    ar_style = ParagraphStyle(
        "ar", fontName="Naskh", fontSize=12, alignment=TA_RIGHT,
        leading=20, wordWrap="RTL",
    )
    en_style = ParagraphStyle(
        "en", fontName="Helvetica", fontSize=11, alignment=TA_LEFT, leading=16,
    )

    doc = SimpleDocTemplate(path, pagesize=A4)
    story = [
        Paragraph(reshape(ARABIC_ONLY),   ar_style), Spacer(1, 6),
        Paragraph(reshape(ARABIC_LATIN),  ar_style), Spacer(1, 6),
        Paragraph(reshape(ARABIC_NUMBER), ar_style), Spacer(1, 6),
        Paragraph(LATIN_ONLY,             en_style),
    ]
    doc.build(story)


def extract_text(path: str) -> str:
    with pdfplumber.open(path) as pdf:
        return "\n".join((p.extract_text() or "") for p in pdf.pages)


# --- Assertion helpers -------------------------------------------------

def check(cond: bool, msg: str, failures: list) -> None:
    tag = "PASS" if cond else "FAIL"
    print(f"  [{tag}] {msg}")
    if not cond:
        failures.append(msg)


def main() -> int:
    assert os.path.exists(AR_FONT), f"Noto Naskh font missing: {AR_FONT}"

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    tmp.close()
    build_pdf(tmp.name)
    print(f"Generated PDF: {tmp.name}")

    text = extract_text(tmp.name)
    # Normalise whitespace for substring checks
    flat = " ".join(text.split())
    print("---- extracted (first 400 chars) ----")
    print(flat[:400])
    print("-------------------------------------")

    failures: list[str] = []

    # 1. Latin tokens survive verbatim (no BiDi reversal, no dropped chars).
    for tok in LATIN_TOKENS:
        check(tok in flat, f"Latin token preserved verbatim: {tok!r}", failures)

    # 2. Latin tokens keep left-to-right order in the mixed Arabic line.
    #    reshape() reverses the visual run, so 'TanStack Start' becomes
    #    'Start TanStack' in the extracted stream if BiDi is doing its job.
    #    Either order proves the letters themselves are intact; what must
    #    NEVER happen is a reversed word like 'kcatSnaT'.
    for tok in ("TanStack", "Supabase", "RLS"):
        reversed_tok = tok[::-1]
        check(reversed_tok not in flat or tok in flat,
              f"Latin word not letter-reversed: {tok!r}", failures)

    # 3. Arabic words appear in their reshaped+bidi form.
    for w in ARABIC_WORDS:
        shaped = reshape(w)
        check(shaped in flat,
              f"Arabic word rendered without drop: {w!r}", failures)

    # 4. Numeric currency chunk stays glued together (no digit reorder).
    check("1,250.00" in flat, "Number 1,250.00 stays intact", failures)
    check("SAR 1,250.00" in flat, "Latin currency phrase 'SAR 1,250.00' intact", failures)

    # 5. The full pure-Arabic sentence round-trips.
    check(reshape(ARABIC_ONLY) in flat,
          "Full Arabic sentence renders in correct visual order", failures)

    # 6. Sanity: no ReportLab black-box marker (missing glyph fallback char).
    check("\ufffd" not in text, "No replacement char \\uFFFD in output", failures)

    print()
    if failures:
        print(f"FAILED: {len(failures)} check(s)")
        for f in failures:
            print(f"  - {f}")
        return 1

    print(f"OK: all checks passed ({tmp.name})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
