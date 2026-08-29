// Generates a "Solve Sheet" PDF-style printable HTML page — ported 1:1 from
// QuizBot's Exam Style (style2 / "🖨️ Exam Style প্রশ্ন + Answer Table") format:
// _PRINT_CSS + _build_print_style2 in hamza818483-dotcom/QuizBot app.py.
// Same fonts, same colors, same layout: 2-column question page, then a
// page-break, then a separate Q.No/Ans/Explanation answer table.

interface SolvePdfQuestion {
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  option_e?: string;
  correct_option: string; // 'A' | 'B' | 'C' | 'D' | 'E'
  user_answer: string | null;
  explanation?: string;
  topic?: string | null;
  subtopic?: string | null;
}

interface SolvePdfParams {
  examName: string;
  studentName?: string;
  questions: SolvePdfQuestion[];
  totalMarks?: number;
  score?: number;
  /** "style1" = inline (Q+Ans+Explanation together), "style2" = separate Answer Table, "style3" = compact 3-column, 50/page, "style4" = OMR sheet layout, landscape, page1 has OMR image + 3 question columns (13 each), later pages 3 columns. Defaults to style2. */
  style?: "style1" | "style2" | "style3" | "style4";
  /** When true (OMR download), omit the answer-key table entirely — blank questions only. */
  hideAnswers?: boolean;
}

const OPTION_KEYS = ["A", "B", "C", "D"] as const;

// Renders a topic/subtopic segment header when the topic or subtopic changes
// from the previous question (blank string means "no topic set"). Topic gets
// a bluish background box, subtopic (if present) a reddish one right below it.
function renderTopicHeaderIfChanged(q: SolvePdfQuestion, prevTopic: string, prevSubtopic: string): string {
  const topic = q.topic || "";
  const subtopic = q.subtopic || "";
  if (topic === prevTopic && subtopic === prevSubtopic) return "";
  let html = "";
  if (topic) {
    html += `<div class="topic-box">${escapeHtml(topic)}</div>`;
  }
  if (subtopic) {
    html += `<div class="subtopic-box">${escapeHtml(subtopic)}</div>`;
  }
  return html;
}

// NOTE: question_text/options/explanation contain trusted HTML (e.g. <img> tags
// for question images) coming from our own DB, same as on the Result page where
// it's rendered via dangerouslySetInnerHTML. So we must NOT escape < > here,
// otherwise <img> tags get turned into literal text and images don't render in
// the PDF.
//
// Vector notation fix: stored text sometimes contains a base character
// followed by U+20D7 (combining right arrow above), e.g. "V ⃗" for vector V,
// with or without a space in between. Native combining-mark rendering for
// this glyph is unreliable in headless Chromium (used for PDF export) the
// same way it was in the app, so it's replaced with a manually positioned
// small arrow above the base character instead of relying on the browser
// to stack the combining mark itself.
const VECTOR_ARROW_REGEX = /([^<>\s])\s?\u20D7/g;
function escapeHtml(str: string | undefined | null): string {
  if (!str) return "";
  return String(str).replace(
    VECTOR_ARROW_REGEX,
    '<span style="position:relative;display:inline-block;padding-top:0.55em;">$1<span style="position:absolute;top:-0.05em;left:50%;transform:translateX(-50%) scaleX(1.3);font-size:0.6em;line-height:1;">&#8594;</span></span>'
  );
}

// Collapses stray blank lines / repeated whitespace inside question or option
// text (e.g. "1.\n\n\nWhat is your name?") down to single spaces, so PDF
// output never shows unexpected extra vertical gaps above/inside a question
// regardless of how the source data was entered.
function normalizeText(str: string | undefined | null): string {
  if (!str) return "";
  return String(str)
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(" ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function escapeHtmlClean(str: string | undefined | null): string {
  return escapeHtml(normalizeText(str));
}

// Returns "inline" (all 4 options on one line — very short values like
// numbers/single words), "table" (2x2 grid — short-ish values), or "list"
// (4 separate rows — long option text).
function getOptionLayout(opts: string[]): "inline" | "table" | "list" {
  let maxLen = 0;
  for (const v of opts) {
    if (v) {
      const clean = String(v).replace(/<[^>]+>/g, "").trim();
      if (clean.length > maxLen) maxLen = clean.length;
    }
  }
  if (maxLen <= 8) return "inline";
  if (maxLen <= 24) return "table";
  return "list";
}

// Ported from QuizBot _check_short_option: options count as "short" only if
// every non-empty option (tags stripped) is 16 chars or fewer.
function checkShortOption(opts: string[]): boolean {
  for (const v of opts) {
    if (v) {
      const clean = String(v).replace(/<[^>]+>/g, "").trim();
      if (clean.length > 24) return false;
    }
  }
  return true;
}

function classifyOptionLength(opts: string[]): "tiny" | "medium" | "long" {
  let maxLen = 0;
  for (const v of opts) {
    if (v) {
      const clean = String(v).replace(/<[^>]+>/g, "").trim();
      if (clean.length > maxLen) maxLen = clean.length;
    }
  }
  if (maxLen <= 8) return "tiny";
  if (maxLen <= 16) return "medium";
  return "long";
}

const GOOGLE_FONTS_LINK = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Sans+Symbols:text=%E2%83%97%E2%8B%85&family=Noto+Sans+Symbols+2:text=%E2%83%97%E2%8B%85&display=swap">`;

// Ported 1:1 from QuizBot's _PRINT_CSS.
const PRINT_CSS = `<style>
@page{size:A4 portrait;margin:10mm 10mm;@top-center{content:none}@bottom-center{content:none}}
body{font-family:'Noto Sans Bengali','SolaimanLipi','Noto Sans','Noto Sans Symbols','Noto Sans Symbols 2',Arial,sans-serif;font-size:12pt;line-height:1.2;color:#000;margin:0 auto;padding:10px}
@media screen{html{background:#fff}body{width:100%;max-width:210mm}}
@media screen{.s3-page{min-width:190mm}}
@media print{body{width:210mm;max-width:210mm}}
.exam-header{text-align:center;border:2px solid #16a34a;background-color:#F0FDF4;border-radius:6px;padding:10px;margin-bottom:15px}
.exam-header h1{color:#166534;margin:0;font-size:15pt;font-weight:bold}
.content-columns{column-count:2;column-gap:15px;column-fill:balance;column-rule:1px solid #ddd}
.question{margin-bottom:7px;break-inside:avoid;page-break-inside:avoid}
.question-header{margin-bottom:4px;display:flex;align-items:flex-start}
.question-num{font-family:'Times New Roman',serif;font-weight:bold;color:#15803d;font-size:12pt;margin-right:5px;white-space:nowrap;flex-shrink:0}
.question-text{flex:1;line-height:1.4;font-size:13pt;color:#000;word-wrap:break-word;white-space:pre-line}
.options-table-short{width:100%;border-collapse:collapse;margin:4px 0 4px 8px;table-layout:fixed}
.options-table-short td{border:none;padding:2px 8px 2px 0;vertical-align:top;font-size:13pt;color:#000;width:40%}
.options-table-short td.answer-col{display:flex;justify-content:center;align-items:center;vertical-align:middle;font-family:'Poppins',sans-serif;font-weight:600;font-size:12pt;color:#000;padding-left:10px}
.answer-circle{font-weight:300;font-family:'Poppins',sans-serif;font-size:12pt;line-height:1}
.opt-letter{display:inline-flex;align-items:center;justify-content:center;width:11pt;height:11pt;border-radius:50%;border:1px solid #000;font-size:7pt;font-weight:600;margin-right:5px;flex-shrink:0;vertical-align:middle}
.options-list{margin:4px 0 4px 8px;padding:0;list-style:none}
.options-list li{display:flex;align-items:center}
.options-list li{margin:1px 0;font-size:13pt;color:#000;word-wrap:break-word;white-space:pre-line}
.option-with-answer{display:flex;justify-content:space-between;align-items:flex-start}
.explanation{margin:4px 0 2px 8px;padding:4px;color:#000;background-color:rgba(22,163,74,0.1);border-left:3px solid #16a34a;font-size:12pt;font-style:italic;break-inside:avoid;white-space:pre-line}
.explanation-label{font-weight:bold;color:#166534}
.page-break{page-break-before:always;break-before:page}
.answers-section{column-count:1;margin-top:0}
.answer-table{width:100%;border-collapse:collapse;margin-top:0;border:1px solid #16a34a}
.answer-table th,.answer-table td{border:1px solid #86efac;padding:6px;text-align:left;vertical-align:top;word-wrap:break-word}
.answer-table th{background-color:#F0FDF4;font-weight:bold;text-align:center;font-size:13pt;color:#166534}
.qno-col{width:8%;text-align:center}.ans-col{width:8%;text-align:center;font-weight:bold;font-size:14pt}.exp-col{width:84%;font-size:12pt;white-space:pre-line}
img{max-width:35%!important;height:auto!important;vertical-align:middle}
@media print{@page{size:A4 portrait;margin:10mm 10mm;@top-center{content:none}@bottom-center{content:none}}body{-webkit-print-color-adjust:exact;color-adjust:exact;width:210mm;max-width:210mm}.question{break-inside:avoid;page-break-inside:avoid}.explanation{break-inside:avoid;page-break-inside:avoid}}
.print-btn{display:block;text-align:center;margin:20px auto;padding:14px 36px;background:linear-gradient(135deg,#5A5FE0,#7c3aed);color:white;border:none;border-radius:10px;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 4px 20px rgba(90,95,224,0.4)}
@media print{.print-btn{display:none}}
.fab-download{position:fixed;bottom:20px;right:20px;z-index:999;display:flex;align-items:center;justify-content:center;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#5A5FE0,#7c3aed);color:#fff;border:none;box-shadow:0 4px 16px rgba(90,95,224,0.5);cursor:pointer}
.fab-download svg{width:26px;height:26px}
@media print{.fab-download{display:none}}
.content-columns-3{column-count:3;column-gap:8px;column-fill:auto;column-rule:1px solid #ddd}
@page omrLandscape{size:297mm 210mm;margin:3mm 4mm}
.omr-page-grid{page:omrLandscape;width:100%;box-sizing:border-box;page-break-after:always;break-after:page}
.omr-page-grid:last-child{page-break-after:auto}
@media print{.omr-page-grid{width:289mm}}
@media screen{.omr-page-grid{width:289mm;margin:0 auto 20px auto;border:1px solid #eee;padding:3mm 4mm;box-sizing:border-box}}
.omr-grid-inner{display:grid;grid-template-columns:24% 1fr;gap:8px;width:100%;align-items:start;border-left:0;min-height:190mm;position:relative}
.omr-grid-inner.omr-cut-line-wrap::after{content:"";position:absolute;left:calc(24% + 4px);top:0;bottom:0;width:0;border-right:2px dashed #999}
.omr-grid-inner.omr-cut-line-wrap::before{content:"✂";position:absolute;left:calc(24% + 4px);top:50%;transform:translate(-50%,-50%) rotate(90deg);font-size:14pt;background:#fff;padding:2px;z-index:2;font-family:'Noto Sans Symbols 2','Noto Sans Symbols',sans-serif}
.omr-grid-imgcol{display:flex;align-items:flex-start}
.omr-grid-imgcol img{width:100%!important;height:auto!important;max-width:100%!important;object-fit:contain;display:block}
.omr-grid-qcols-wrap{display:flex;flex-direction:column}
.omr-grid-qcols-fixed{display:flex;gap:8px;width:100%;align-items:flex-start}
.omr-qcol{flex:1;min-width:0;font-size:7.8pt}
.omr-qcol:not(:last-child){border-right:2px solid #999;padding-right:8px}
.omr-qcol .question-s3{font-size:7.8pt;margin-bottom:2px}
.omr-qcol .question-s3 .question-num,.omr-qcol .question-s3 .question-text{font-size:7.8pt}
.omr-qcol .options-list-s3,.omr-qcol .options-table-s3,.omr-qcol .options-inline-s3{margin:0 0 1px 8px}
.omr-qcol .options-list-s3 li,.omr-qcol .options-table-s3 td,.omr-qcol .options-inline-s3 .opt-item-s3{font-size:7.8pt}
.omr-qcol .options-inline-s3{gap:8px}
.omr-qcol .options-inline-s3 .opt-letter-s3{margin-right:4px}
.omr-page2-full{width:100%;min-height:190mm}
.omr-page2-cols{display:flex;gap:8px;width:100%;align-items:flex-start}
.omr-qpage-header{margin-bottom:2mm}
.omr-qpage-title{font-family:'Noto Sans Bengali',sans-serif;font-weight:700;font-size:12pt;text-align:center;margin:0 0 1.5mm 0}
.omr-qpage-meta{display:flex;justify-content:space-between;font-family:'Noto Sans Bengali',sans-serif;font-size:8.5pt;margin-bottom:1mm}
.omr-qpage-type{font-family:'Noto Sans Bengali',sans-serif;font-weight:700;font-size:9.5pt;text-align:center;border-top:1px solid #333;border-bottom:1px solid #333;padding:1mm 0;margin-bottom:2mm}

.omr-header{font-family:'Noto Sans Bengali',sans-serif;font-weight:700;font-size:11pt;color:#166534;text-align:center;background:#DCFCE7;border:1px solid #86efac;border-radius:4px;padding:3mm 2mm;margin:0 0 3mm 0}
.omr-qpage-title{font-family:'Noto Sans Bengali',sans-serif;font-weight:700;font-size:13pt;text-align:center;margin:0 0 2mm 0}
.omr-qpage-meta{display:flex;justify-content:space-between;font-family:'Noto Sans Bengali',sans-serif;font-size:9pt;margin-bottom:1mm}
.omr-qpage-type{font-family:'Noto Sans Bengali',sans-serif;font-weight:700;font-size:10pt;text-align:center;border-top:1px solid #333;border-bottom:1px solid #333;padding:1mm 0;margin-bottom:2mm}
@media print{.omr-page{width:289mm;min-height:190mm}}
.question-s3{margin-bottom:7px;break-inside:avoid;page-break-inside:avoid;font-size:8.8pt;line-height:1.18}
.question-s3 .question-header{margin-bottom:1px;display:flex;align-items:flex-start}
.question-s3 .question-num{font-family:'Times New Roman',serif;font-weight:bold;color:#15803d;font-size:8.8pt;margin-right:3px;white-space:nowrap;flex-shrink:0}
.question-s3 .question-text{flex:1;line-height:1.18;font-size:8.8pt;color:#000;word-wrap:break-word;white-space:pre-line}
.options-list-s3{margin:1px 0 2px 10px;padding:0;list-style:none}
.options-row-s3{display:flex;flex-wrap:wrap;gap:6px;margin:1px 0 2px 10px}
.options-row-s3 .opt-item-s3{display:inline-flex;align-items:center;font-size:8.5pt;color:#000;white-space:nowrap}
.options-row-s3{display:flex;gap:6px;margin:1px 0 2px 10px;flex-wrap:nowrap}
.options-row-s3 .opt-item-s3{display:flex;align-items:center;font-size:8.5pt;color:#000;white-space:nowrap}
.options-inline-s3{display:flex;gap:12px;margin:1px 0 2px 10px;flex-wrap:nowrap}
.options-inline-s3 .opt-item-s3{display:flex;align-items:center;white-space:nowrap}
.options-inline-s3 .opt-letter-s3{margin-right:5px}
.options-list-s3 li{display:flex;align-items:center;margin:0;font-size:8.5pt;color:#000;word-wrap:break-word}
.opt-letter-s3{display:inline-flex;align-items:center;justify-content:center;width:7pt;height:7pt;border-radius:50%;border:0.6px solid #000;font-size:5pt;font-weight:600;margin-right:3px;flex-shrink:0}
.options-table-s3{width:100%;border-collapse:collapse;margin:1px 0 2px 10px;table-layout:fixed}
.options-table-s3 td{border:none;padding:0 4px 0 0;vertical-align:top;font-size:8.5pt;color:#000;width:50%}
@page s3{size:A4 portrait;margin:8mm 8mm}
.s3-page{page:s3}
.topic-box{background-color:#F0FDF4;border:2px solid #16a34a;color:#166534;font-weight:700;font-size:11pt;padding:6px 14px;border-radius:6px;margin:10px auto 6px;break-after:avoid;break-inside:avoid;text-align:center;width:fit-content;max-width:80%}
.subtopic-box{background-color:#FEF9C3;border:1.5px solid #ca8a04;color:#713f12;font-weight:600;font-size:9.5pt;padding:4px 12px;border-radius:6px;margin:0 auto 8px;break-after:avoid;break-inside:avoid;text-align:center;width:fit-content;max-width:70%}
@media screen{
.a4-page{background:#fff;width:210mm;max-width:100%;box-sizing:border-box;margin:0 auto 16px;padding:10mm;box-shadow:0 1px 6px rgba(0,0,0,0.15);border:1px solid #e5e7eb;border-radius:2px}
body{background:#e5e7eb;padding:16px 0}
}
@media print{.a4-page{width:auto;margin:0;padding:0;box-shadow:none;border:none}}
</style>`;

export function generateSolvePdfHtml({ examName, questions, style = "style2", hideAnswers = false }: SolvePdfParams): string {
  const heading = escapeHtml(examName) || "Exam";

  if (style === "style1") {
    // Ported 1:1 from QuizBot _build_print_style1: Q + inline answer circle + explanation together.
    // Paginated into fixed-size chunks (matching style3's proven approach) so
    // screen preview shows distinct A4-look page cards instead of one long
    // CSS-column-balanced scroll, and print output breaks at the same points.
    const PER_PAGE = 20;
    const pages: SolvePdfQuestion[][] = [];
    for (let i = 0; i < questions.length; i += PER_PAGE) pages.push(questions.slice(i, i + PER_PAGE));

    let body = "";
    let _prevTopic1 = "";
    let _prevSubtopic1 = "";
    pages.forEach((pageQs, pIdx) => {
      body += `<div class="a4-page"${pIdx > 0 ? ' style="page-break-before:always"' : ""}>`;
      if (pIdx === 0) body += `<div class="exam-header"><h1>${heading} - Practice Sheet</h1></div>`;
      body += `<div class="content-columns">`;

      pageQs.forEach((q, idx) => {
        const n = pIdx * PER_PAGE + idx + 1;
        const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
        const isShort = checkShortOption(opts);
        const qNum = String(n).padStart(2, "0");
        const ai = OPTION_KEYS.indexOf(q.correct_option as any);
        const ansCircle = `[${ai >= 0 ? OPTION_KEYS[ai] : "?"}]`;

        body += renderTopicHeaderIfChanged(q, _prevTopic1, _prevSubtopic1);
        _prevTopic1 = q.topic || "";
        _prevSubtopic1 = q.subtopic || "";

        body += `<div class="question"><div class="question-header"><span class="question-num">${qNum}.</span><div class="question-text">${escapeHtmlClean(q.question_text)}</div></div>`;

        if (isShort) {
          body += `<table class="options-table-short"><tr><td class="option-col"><span class="opt-letter">A</span>${escapeHtmlClean(opts[0])}</td><td class="option-col"><span class="opt-letter">B</span>${escapeHtmlClean(opts[1])}</td><td rowspan="2" class="answer-col"><span class="answer-circle">${ansCircle}</span></td></tr><tr><td class="option-col"><span class="opt-letter">C</span>${escapeHtmlClean(opts[2])}</td><td class="option-col"><span class="opt-letter">D</span>${escapeHtmlClean(opts[3])}</td></tr></table>`;
        } else {
          body += `<ul class="options-list"><li><span class="opt-letter">A</span>${escapeHtmlClean(opts[0])}</li><li><span class="opt-letter">B</span>${escapeHtmlClean(opts[1])}</li><li><span class="opt-letter">C</span>${escapeHtmlClean(opts[2])}</li><li class="option-with-answer"><span><span class="opt-letter">D</span>${escapeHtmlClean(opts[3])}</span><span class="answer-circle">${ansCircle}</span></li></ul>`;
        }
        if (q.explanation) {
          body += `<div class="explanation"><span class="explanation-label">ব্যাখ্যা:</span> ${escapeHtml(q.explanation)}</div>`;
        }
        body += "</div>";
      });

      body += "</div></div>";
    });

    body += `<button class="print-btn" onclick="window.print()">PDF হিসেবে ডাউনলোড / প্রিন্ট করুন</button><button class="fab-download" onclick="window.print()" aria-label="Download PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>`;
    return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8">${GOOGLE_FONTS_LINK}${PRINT_CSS}<title>${heading}</title></head><body>${body}</body></html>`;
  }

  if (style === "style3") {
    // Compact 3-column layout, 50 MCQs per printed page, answer table at end.
    const PER_PAGE = 50;
    let body = "";
    const pages: SolvePdfQuestion[][] = [];
    for (let i = 0; i < questions.length; i += PER_PAGE) pages.push(questions.slice(i, i + PER_PAGE));

    pages.forEach((pageQs, pIdx) => {
      body += `<div class="a4-page s3-page"${pIdx > 0 ? ' style="page-break-before:always"' : ""}>`;
      body += `<div class="exam-header"><h1>${heading} - Practice Sheet</h1></div><div class="content-columns-3">`;
      pageQs.forEach((q, idx) => {
        const n = pIdx * PER_PAGE + idx + 1;
        const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
        const isShort = checkShortOption(opts);
        const qNum = String(n).padStart(2, "0");
        body += `<div class="question-s3"><div class="question-header"><span class="question-num">${qNum}.</span><div class="question-text">${escapeHtmlClean(q.question_text)}</div></div>`;
        if (isShort) {
          body += `<table class="options-table-s3"><tr><td><span class="opt-letter-s3">A</span>${escapeHtmlClean(opts[0])}</td><td><span class="opt-letter-s3">B</span>${escapeHtmlClean(opts[1])}</td></tr><tr><td><span class="opt-letter-s3">C</span>${escapeHtmlClean(opts[2])}</td><td><span class="opt-letter-s3">D</span>${escapeHtmlClean(opts[3])}</td></tr></table>`;
        } else {
          body += `<ul class="options-list-s3"><li><span class="opt-letter-s3">A</span>${escapeHtmlClean(opts[0])}</li><li><span class="opt-letter-s3">B</span>${escapeHtmlClean(opts[1])}</li><li><span class="opt-letter-s3">C</span>${escapeHtmlClean(opts[2])}</li><li><span class="opt-letter-s3">D</span>${escapeHtmlClean(opts[3])}</li></ul>`;
        }
        body += "</div>";
      });
      body += "</div></div>";
    });

    body += `<div class="page-break"></div><div class="answers-section"><table class="answer-table"><thead><tr><th class="qno-col">Q.No.</th><th class="ans-col">Ans</th><th class="exp-col">Explanation</th></tr></thead><tbody>`;
    questions.forEach((q, idx) => {
      const n = idx + 1;
      const al = OPTION_KEYS.includes(q.correct_option as any) ? q.correct_option : "-";
      body += `<tr><td class="qno-col">${n}</td><td class="ans-col">${escapeHtml(al)}</td><td class="exp-col">${q.explanation ? escapeHtml(q.explanation) : "-"}</td></tr>`;
    });
    body += "</tbody></table></div>";
    body += `<button class="print-btn" onclick="window.print()">PDF হিসেবে ডাউনলোড / প্রিন্ট করুন</button><button class="fab-download" onclick="window.print()" aria-label="Download PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>`;
    return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8">${GOOGLE_FONTS_LINK}${PRINT_CSS}<title>${heading}</title></head><body>${body}</body></html>`;
  }

  if (style === "style4") {
    // OMR sheet layout: Letter landscape (792x612pt / 11in x 8.5in) — matches the
    // reference app's real PDF output exactly (verified against sample PDF).
    // Page 1: grid col1 = OMR sheet image + header, col2 = 3-column Q block (42 Qs,
    // since image+header eats vertical room). Page 2..N: full-width 4-column Q
    // block, 50 Qs/page (blank img-col only rendered visually on page2 as a
    // continuation stripe, not on later pages — avoids wasted empty space).
    const renderQ = (q: SolvePdfQuestion, n: number) => {
      const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
      const layout = getOptionLayout(opts);
      const qNum = String(n).padStart(2, "0");
      let h = `<div class="question-s3"><div class="question-header"><span class="question-num">${qNum}.</span><div class="question-text">${escapeHtmlClean(q.question_text)}</div></div>`;
      if (layout === "inline") {
        h += `<div class="options-inline-s3"><span class="opt-item-s3"><span class="opt-letter-s3">A</span>${escapeHtmlClean(opts[0])}</span><span class="opt-item-s3"><span class="opt-letter-s3">B</span>${escapeHtmlClean(opts[1])}</span><span class="opt-item-s3"><span class="opt-letter-s3">C</span>${escapeHtmlClean(opts[2])}</span><span class="opt-item-s3"><span class="opt-letter-s3">D</span>${escapeHtmlClean(opts[3])}</span></div>`;
      } else if (layout === "table") {
        h += `<table class="options-table-s3"><tr><td><span class="opt-letter-s3">A</span>${escapeHtmlClean(opts[0])}</td><td><span class="opt-letter-s3">B</span>${escapeHtmlClean(opts[1])}</td></tr><tr><td><span class="opt-letter-s3">C</span>${escapeHtmlClean(opts[2])}</td><td><span class="opt-letter-s3">D</span>${escapeHtmlClean(opts[3])}</td></tr></table>`;
      } else {
        h += `<ul class="options-list-s3"><li><span class="opt-letter-s3">A</span>${escapeHtmlClean(opts[0])}</li><li><span class="opt-letter-s3">B</span>${escapeHtmlClean(opts[1])}</li><li><span class="opt-letter-s3">C</span>${escapeHtmlClean(opts[2])}</li><li><span class="opt-letter-s3">D</span>${escapeHtmlClean(opts[3])}</li></ul>`;
      }
      h += "</div>";
      return h;
    };

    const PAGE1_COUNT = 45;
    const page1Qs = questions.slice(0, PAGE1_COUNT);
    const restQs = questions.slice(PAGE1_COUNT);
    // Force everything after page1 onto a single page2 (user requires exactly
    // 2 pages total) rather than splitting into a 3rd page.
    const restPages: SolvePdfQuestion[][] = restQs.length > 0 ? [restQs] : [];

    // Split a page's questions into exactly N fixed columns (deterministic —
    // no CSS column-balancing, so it can never overflow to an extra page).
    const splitIntoN = (qs: SolvePdfQuestion[], startNum: number, n: number) => {
      const per = Math.ceil(qs.length / n);
      const cols: SolvePdfQuestion[][] = [];
      for (let i = 0; i < n; i++) cols.push(qs.slice(i * per, (i + 1) * per));
      let num = startNum;
      return cols.map((col) => col.map((q) => renderQ(q, num++)).join(""));
    };

    // Split a page's questions into exactly 3 fixed columns. If withHeader is
    // true, column-1 gets a smaller share (since the header block eats some
    // of its vertical room) while columns 2/3 take more, keeping all three
    // columns visually bottom-aligned instead of column-1 running short and
    // leaving columns 2/3 with unused space at the top.
    const splitInto3 = (qs: SolvePdfQuestion[], startNum: number, withHeader = false) => {
      const total = qs.length;
      let c1: number, c2: number, c3: number;
      if (withHeader && total > 6) {
        // Header ~= 4 questions' worth of vertical space at this font/margin.
        const headerCostQs = 4;
        const remaining = total - Math.max(0, Math.ceil(total / 3) - headerCostQs);
        c1 = Math.max(1, Math.ceil(total / 3) - headerCostQs);
        c2 = Math.ceil((total - c1) / 2);
        c3 = total - c1 - c2;
      } else {
        c1 = Math.ceil(total / 3);
        c2 = Math.ceil(total / 3);
        c3 = total - c1 - c2;
      }
      const cols = [qs.slice(0, c1), qs.slice(c1, c1 + c2), qs.slice(c1 + c2)];
      let n = startNum;
      return cols.map((col, ci) => {
        const html = col.map((q) => renderQ(q, n++)).join("");
        return ci === 0 && withHeader ? headerBlock + html : html;
      });
    };

    const headerBlock = `<div class="omr-qpage-header">
      <div class="omr-qpage-title">প্রশ্নপত্র</div>
      <div class="omr-qpage-meta"><span>পূর্নমান: ${questions.length}</span><span>সময়: ১ ঘন্টা</span></div>
      <div class="omr-qpage-type">বহুনির্বাচনি প্রশ্ন</div>
    </div>`;

    const page1Cols = splitInto3(page1Qs, 1, true);
    const page1 = `<div class="omr-page-grid"><div class="omr-grid-inner omr-cut-line-wrap">
      <div class="omr-grid-imgcol"><img src="/omr/atlas-omr-sheet.png" alt="OMR Sheet" /></div>
      <div class="omr-grid-qcols-fixed">${page1Cols.map((c) => `<div class="omr-qcol">${c}</div>`).join("")}</div>
    </div></div>`;

    let running = PAGE1_COUNT;
    const page2Plus = restPages
      .map((pageQs) => {
        const cols = splitIntoN(pageQs, running + 1, 4);
        const html = `<div class="omr-page-grid"><div class="omr-page2-full">
      <div class="omr-page2-cols">${cols.map((c) => `<div class="omr-qcol">${c}</div>`).join("")}</div>
    </div></div>`;
        running += pageQs.length;
        return html;
      })
      .join("");

    const body = `${page1}${page2Plus}`;

    const OMR_PAGE_CSS = `<style>@page{size:297mm 210mm;margin:4mm}@media print{@page{size:297mm 210mm;margin:4mm}body{width:289mm!important;max-width:289mm!important}}body{width:289mm!important;max-width:289mm!important}</style>`;
    return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8">${GOOGLE_FONTS_LINK}${PRINT_CSS}${OMR_PAGE_CSS}<title>${heading}</title></head><body>${body}<button class="print-btn" onclick="window.print()">PDF হিসেবে ডাউনলোড / প্রিন্ট করুন (Paper: A4, Landscape)</button></body></html>`;
  }

  // style2 (default): questions page + separate answer table.
  const PER_PAGE_S2 = 24;
  const pages2: SolvePdfQuestion[][] = [];
  for (let i = 0; i < questions.length; i += PER_PAGE_S2) pages2.push(questions.slice(i, i + PER_PAGE_S2));

  let body = "";
  let _prevTopic2 = "";
  let _prevSubtopic2 = "";
  pages2.forEach((pageQs, pIdx) => {
    body += `<div class="a4-page"${pIdx > 0 ? ' style="page-break-before:always"' : ""}>`;
    if (pIdx === 0) body += `<div class="exam-header"><h1>${heading} - Questions</h1></div>`;
    body += `<div class="content-columns">`;

    pageQs.forEach((q, idx) => {
      const n = pIdx * PER_PAGE_S2 + idx + 1;
      const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
      const isShort = checkShortOption(opts);
      const qNum = String(n).padStart(2, "0");

      body += renderTopicHeaderIfChanged(q, _prevTopic2, _prevSubtopic2);
      _prevTopic2 = q.topic || "";
      _prevSubtopic2 = q.subtopic || "";

      body += `<div class="question"><div class="question-header"><span class="question-num">${qNum}.</span><div class="question-text">${escapeHtmlClean(q.question_text)}</div></div>`;

      if (isShort) {
        body += `<table class="options-table-short"><tr><td><span class="opt-letter">A</span>${escapeHtmlClean(opts[0])}</td><td><span class="opt-letter">B</span>${escapeHtmlClean(opts[1])}</td></tr><tr><td><span class="opt-letter">C</span>${escapeHtmlClean(opts[2])}</td><td><span class="opt-letter">D</span>${escapeHtmlClean(opts[3])}</td></tr></table>`;
      } else {
        body += `<ul class="options-list"><li><span class="opt-letter">A</span>${escapeHtmlClean(opts[0])}</li><li><span class="opt-letter">B</span>${escapeHtmlClean(opts[1])}</li><li><span class="opt-letter">C</span>${escapeHtmlClean(opts[2])}</li><li><span class="opt-letter">D</span>${escapeHtmlClean(opts[3])}</li></ul>`;
      }
      body += "</div>";
    });

    body += `</div></div>`;
  });

  if (!hideAnswers) {
    body += `<div class="a4-page" style="page-break-before:always"><div class="answers-section"><table class="answer-table"><thead><tr><th class="qno-col">Q.No.</th><th class="ans-col">Ans</th><th class="exp-col">Explanation</th></tr></thead><tbody>`;

    questions.forEach((q, idx) => {
      const n = idx + 1;
      const al = OPTION_KEYS.includes(q.correct_option as any) ? q.correct_option : "-";
      body += `<tr><td class="qno-col">${n}</td><td class="ans-col">${escapeHtml(al)}</td><td class="exp-col">${q.explanation ? escapeHtml(q.explanation) : "-"}</td></tr>`;
    });

    body += "</tbody></table></div></div>";
  }
  body += `<button class="print-btn" onclick="window.print()">PDF হিসেবে ডাউনলোড / প্রিন্ট করুন</button><button class="fab-download" onclick="window.print()" aria-label="Download PDF"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>`;

  return `<!DOCTYPE html><html lang="bn"><head><meta charset="UTF-8">${GOOGLE_FONTS_LINK}${PRINT_CSS}<title>${heading}</title></head><body>${body}</body></html>`;
}

export function openSolvePdf(params: SolvePdfParams) {
  const html = generateSolvePdfHtml(params);
  const win = window.open("", "_blank");
  if (!win) {
    // Popup blocked — fallback to downloadable file
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "practice-sheet.html";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
