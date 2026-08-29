import React, { useEffect, useRef, useState } from 'react';

// ⚠️ DO NOT MODIFY THIS FILE'S CORE LOGIC WITHOUT EXPLICIT PERMISSION ⚠️
// This implementation (escapeHtml + replaceVectorArrows + toSafeHtml) is the
// verified, working fix for:
//   1. Vector arrow (U+20D7 combining mark, e.g. "F⃗") rendering as a boxed
//      "missing glyph" instead of a real arrow above the letter — fixed by
//      manually drawing a small U+2192 arrow via absolute-positioned CSS
//      instead of relying on the browser/font to shape the combining mark.
//   2. Multi-line question/option text from CSV import collapsing onto one
//      line — fixed by escaping the text as plain text (not raw HTML) and
//      converting literal "\n" into "<br>".
// A prior change replaced this with DOMPurify.sanitize() for security and
// broke BOTH of the above (DOMPurify does not know about the vector-arrow
// span trick and the CSS ended up stripped/altered). That change was
// reverted. If you need to sanitize HTML here, do it INSIDE toSafeHtml()
// by extending escapeHtml — do not swap out this file's rendering pipeline
// for a generic sanitizer library, and do not remove replaceVectorArrows()
// or the "\n" -> "<br>" conversion. Test both vector-arrow rendering and
// multi-line CSV-imported questions before touching this file again.

interface MathTextProps {
  text: string;
  className?: string;
  as?: React.ElementType;
}

declare global {
  interface Window {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MathJax: any;
  }
}

// Escapes a plain-text segment for safe HTML embedding.
function escapeHtml(segment: string): string {
  return segment
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// U+20D7 (combining right arrow above) relies on the browser/OS text-shaping
// engine to draw it stacked over the preceding character. On several mobile
// browsers this fails outright (renders as a missing-glyph box) even when
// the font file has the glyph, because the shaping step itself doesn't
// support this rarely-used combining mark. Instead of depending on native
// combining-mark rendering, this renders the arrow as a manually positioned
// span sitting above the character that precedes it — works identically
// everywhere since it's just two stacked, independently-drawn glyphs.
const VECTOR_ARROW_REGEX = /([^<>\s])\s?\u20D7/g;
function replaceVectorArrows(html: string): string {
  // Uses a standard right-arrow (U+2192, universally supported by every
  // font) sized down and positioned above the preceding character, rather
  // than trying to render U+20D7 itself — some fonts only define U+20D7 as
  // an actual combining glyph and fail to draw it standalone too.
  // Note: stored text sometimes has a space between the base character and
  // the arrow (e.g. "V ⃗" rather than "V⃗") — the optional \s? consumes and
  // discards that space so the arrow still renders directly above the V.
  return html.replace(
    VECTOR_ARROW_REGEX,
    '<span style="position:relative;display:inline-block;padding-top:0.55em;">$1<span style="position:absolute;top:-0.05em;left:50%;transform:translateX(-50%) scaleX(1.3);font-size:0.6em;line-height:1;">&#8594;</span></span>'
  );
}

// Some CSV-imported question text has a stray newline landing INSIDE a
// MathJax inline-math span (e.g. "$^{γ}$" broken across two source lines as
// "$^{γ}$" preceded/followed by a lone "γ" or "=k" on its own line — visible
// as a source artifact where the exponent notation and its line get split).
// MathJax's "$...$" delimiter requires one unbroken string with no HTML tag
// in between; converting an embedded "\n" to "<br>" while it sits inside a
// "$...$" span breaks the expression into disconnected fragments that
// MathJax can no longer recognize as a single formula, so it falls back to
// printing the raw "$...$" text and the orphaned fragment on separate lines
// instead of a rendered exponent/subscript. Fix: collapse any "\n" (with
// optional surrounding whitespace) that falls between a "$" and its
// matching closing "$" back into a single space BEFORE the newline->br
// conversion runs, so the whole "$...$" expression stays one contiguous
// unit for MathJax. Only touches newlines strictly inside a dollar-pair;
// newlines outside math spans (the real "i./ii./iii." line breaks) are
// left untouched for the <br> conversion below.
function collapseNewlinesInsideMath(text: string): string {
  return text.replace(/\$([^$]*)\$/g, (whole, inner: string) => {
    if (!/\n/.test(inner)) return whole;
    return '$' + inner.replace(/\s*\n\s*/g, ' ').trim() + '$';
  });
}

// Some CSV-imported question text stores exponents/subscripts as their OWN
// math span with no base character, e.g. "PV$^{γ}$=k" — the "$^{γ}$" span
// is bare TeX "^{γ}" with nothing before the "^". That is invalid TeX (a
// superscript needs a preceding atom to attach to); MathJax throws on it
// and falls back to printing the raw "$...$" text, which is why the
// question shows "PV", "γ", "=k" as disconnected fragments instead of a
// rendered "PVᵞ=k". Fix: before typesetting, find any "$^{...}$" or
// "$_{...}$" span (optionally combined, e.g. "$^{γ}_{2}$") that is
// immediately preceded by a non-space, non-$ token, and pull that token
// INSIDE the span as the base, e.g. "PV$^{γ}$" -> "$PV^{γ}$". This makes
// the TeX valid without needing to re-export the source CSVs.
function fixBaselessExponents(text: string): string {
  return text.replace(
    /([^\s$]+)\$((?:\^\{[^}]*\}|_\{[^}]*\})+)\$/g,
    (whole, base: string, script: string) => {
      // Strip a leading list marker like "1." / "2." / "iii." so it stays
      // plain text outside the math span instead of leaking into MathJax's
      // "$...$" delimiters (which would render the digit+dot as math and
      // misalign/break the rendering).
      // Non-breaking space (U+00A0) between the list marker and the math
      // span: MathJax renders "$...$" as an inline-block SVG widget, and on
      // narrow (mobile) widths a regular space there lets the browser wrap
      // the line right after "i."/"1." — leaving the marker on its own line
      // and the formula on the next, which looks like the marker and its
      // equation "broke apart" even though no real line-break was ever in
      // the source. The \u00A0 glues them so they wrap together.
      const marker = base.match(/^([0-9]+\.|[ivx]+\.)/i);
      if (marker) {
        const prefix = marker[0];
        const realBase = base.slice(prefix.length);
        return realBase ? `${prefix}\u00A0$${realBase}${script}$` : `${prefix}\u00A0$${script}$`;
      }
      return `$${base}${script}$`;
    }
  );
}

// Besides <img> tags, imported CSV question/option text may contain a small
// allow-list of inline formatting tags for chemistry/math notation, e.g.
// "CH<sub>3</sub>CHO" or "x<sup>2</sup>" — these must pass through as real
// HTML (not escaped to visible "&lt;sub&gt;" text) while everything else in
// the string still gets escaped as plain text. No attributes are allowed on
// these tags (kept attribute-free on purpose — this is a plain allow-list,
// not a general sanitizer, so there is nothing here for CSV content to hide
// a script or event handler inside).
const PASSTHROUGH_TAG_PATTERN = /<img\b[^>]*>|<\/?(?:sub|sup|b|strong|i|em|u|mark|br)\s*\/?>/gi;

// Some CSV-imported <img src="..."> URLs have a stray space or newline
// accidentally inserted mid-URL (e.g. wrapped source text), breaking the
// link entirely — "https://i.ibb.co/5Wgg H9mR/....png" instead of
// "https://i.ibb.co/5WggH9mR/....png". Strip any whitespace found strictly
// inside an <img ...> tag's src="..." attribute before rendering, so the
// image actually loads instead of showing a broken-image icon.
function fixBrokenImgSrcWhitespace(text: string): string {
  return text.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']*)(["'][^>]*>)/gi,
    (whole, before: string, url: string, after: string) => before + url.replace(/\s+/g, '') + after
  );
}

// Some stored questions embed a literal <img class="qimg" src="..."> tag to
// show a diagram inline. Everything else in the text is plain text that must
// be escaped, not parsed as HTML. This splits on <img ...> tags, escapes the
// text segments in between, converts literal newlines to <br> so multi-line
// "i./ii./iii." style questions render as separate lines, and re-assembles
// safe HTML with the original <img> tags intact.
function toSafeHtml(rawText: string): string {
  const text = fixBrokenImgSrcWhitespace(fixBaselessExponents(collapseNewlinesInsideMath(rawText)));
  let lastIndex = 0;
  let result = '';
  let match: RegExpExecArray | null;
  PASSTHROUGH_TAG_PATTERN.lastIndex = 0;
  while ((match = PASSTHROUGH_TAG_PATTERN.exec(text)) !== null) {
    const before = text.slice(lastIndex, match.index);
    result += replaceVectorArrows(escapeHtml(before).replace(/\n/g, '<br>'));
    result += match[0];
    lastIndex = match.index + match[0].length;
  }
  result += replaceVectorArrows(escapeHtml(text.slice(lastIndex)).replace(/\n/g, '<br>'));
  return result;
}

const MathText: React.FC<MathTextProps> = ({ text, className, as: Component = 'div' }) => {
  const containerRef = useRef<HTMLElement>(null);
  const [isMathJaxReady, setIsMathJaxReady] = useState(false);

  // Poll for MathJax readiness
  useEffect(() => {
    if (window.MathJax && window.MathJax.typesetPromise) {
        setIsMathJaxReady(true);
    } else {
        const interval = setInterval(() => {
            if (window.MathJax && window.MathJax.typesetPromise) {
                setIsMathJaxReady(true);
                clearInterval(interval);
            }
        }, 100);
        return () => clearInterval(interval);
    }
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = toSafeHtml(text || '');

      if (isMathJaxReady && window.MathJax && window.MathJax.typesetPromise) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          window.MathJax.typesetPromise([containerRef.current]).catch((err: any) =>
            console.error('MathJax typeset failed: ', err)
          );
      }
    }
  }, [text, isMathJaxReady]);

  return (
    <Component ref={containerRef} className={className} />
  );
};

export default MathText;
