/*
 * LIVIA page -> Markdown extractor (browser only).
 *
 * Step 1 of the RAG pipeline: strip boilerplate and keep structure. Produces
 * semantic Markdown (H1-H4, lists, tables, code blocks) from the live DOM and
 * applies the same privacy exclusions as page analysis: no forms, editable
 * controls, hidden content, or credential/payment-looking fields. The output
 * never leaves the tab except as the few passages returned for a question.
 */
(function (root) {
  const SKIP =
    'script, style, noscript, svg, canvas, iframe, form, input, textarea, select, button, nav, footer, aside, header[role="banner"], ' +
    '[contenteditable="true"], [role="textbox"], [role="navigation"], [role="banner"], [role="contentinfo"], [role="complementary"], ' +
    '[aria-hidden="true"], [hidden], [data-livia-ignore], #livia-companion, [class*="cookie" i], [id*="cookie" i], [class*="advert" i], [id*="advert" i]';
  const BLOCK = 'p, div, section, article, main, ul, ol, li, table, pre, blockquote, h1, h2, h3, h4, h5, h6, dl, figure';
  const MAX_CHARS = 400_000;
  const MAX_NODES = 25_000;

  function collapse(text) {
    return String(text || '').replace(/\s+/g, ' ').trim();
  }

  function toMarkdown(doc, { isSensitive = () => false, win = doc.defaultView } = {}) {
    const out = [];
    let chars = 0;
    let nodes = 0;

    const hidden = (el) => {
      if (!win || !win.getComputedStyle) return false;
      const style = win.getComputedStyle(el);
      return style.display === 'none' || style.visibility === 'hidden';
    };

    const skipped = (el) => {
      nodes += 1;
      if (nodes > MAX_NODES) return true;
      if (isSensitive(el)) return true;
      if (el.matches && el.matches(SKIP)) return true;
      return hidden(el);
    };

    const push = (text) => {
      if (!text || chars >= MAX_CHARS) return;
      out.push(text);
      chars += text.length;
    };

    function inline(el) {
      let text = '';
      for (const child of el.childNodes) {
        if (chars + text.length >= MAX_CHARS) break;
        if (child.nodeType === 3) text += child.nodeValue;
        else if (child.nodeType === 1 && !skipped(child)) {
          const tag = child.tagName;
          if (tag === 'BR') text += ' ';
          else if (tag === 'CODE') text += `\`${collapse(child.textContent)}\``;
          else if (tag === 'A' || tag === 'SPAN' || tag === 'EM' || tag === 'STRONG' || tag === 'B' || tag === 'I' || tag === 'SMALL' || tag === 'MARK' || tag === 'SUB' || tag === 'SUP' || tag === 'TIME' || tag === 'ABBR' || tag === 'LABEL') text += inline(child);
          else text += ` ${inline(child)} `;
        }
      }
      return text;
    }

    function table(el) {
      const rows = [...el.querySelectorAll('tr')]
        .filter((tr) => !skipped(tr))
        .map((tr) => [...tr.children].filter((c) => c.tagName === 'TH' || c.tagName === 'TD').map((c) => collapse(inline(c)).replace(/\|/g, '\\|')))
        .filter((cells) => cells.length);
      if (rows.length < 1) return;
      const width = Math.max(...rows.map((r) => r.length));
      const pad = (r) => [...r, ...Array(width - r.length).fill('')];
      const lines = [`| ${pad(rows[0]).join(' | ')} |`, `| ${Array(width).fill('---').join(' | ')} |`];
      for (const row of rows.slice(1)) lines.push(`| ${pad(row).join(' | ')} |`);
      push(`\n\n${lines.join('\n')}\n\n`);
    }

    function walk(el, listDepth = 0) {
      for (const child of el.childNodes) {
        if (chars >= MAX_CHARS || nodes > MAX_NODES) return;

        if (child.nodeType === 3) {
          const text = collapse(child.nodeValue);
          if (text.length > 1) push(`\n\n${text}\n\n`);
          continue;
        }
        if (child.nodeType !== 1 || skipped(child)) continue;

        const tag = child.tagName;
        if (/^H[1-6]$/.test(tag)) {
          const text = collapse(inline(child));
          if (text) push(`\n\n${'#'.repeat(Math.min(4, Number(tag[1])))} ${text}\n\n`);
        } else if (tag === 'TABLE') {
          table(child);
        } else if (tag === 'PRE') {
          const code = (child.textContent || '').replace(/\s+$/, '').slice(0, 20_000);
          if (code.trim()) push(`\n\n\`\`\`\n${code}\n\`\`\`\n\n`);
        } else if (tag === 'UL' || tag === 'OL') {
          for (const li of child.children) {
            if (li.tagName !== 'LI' || skipped(li)) continue;
            const hasNested = li.querySelector('ul, ol');
            const text = collapse(hasNested ? inline(li) : inline(li));
            if (text) push(`${'  '.repeat(listDepth)}- ${text}\n`);
            if (hasNested) walk(li, listDepth + 1);
          }
          push('\n');
        } else if (tag === 'P' || tag === 'BLOCKQUOTE' || tag === 'FIGCAPTION' || tag === 'DT' || tag === 'DD') {
          const text = collapse(inline(child));
          if (text) push(`\n\n${tag === 'BLOCKQUOTE' ? '> ' : ''}${text}\n\n`);
        } else if (child.querySelector(BLOCK)) {
          walk(child, listDepth);
        } else {
          const text = collapse(inline(child));
          if (text.length > 1) push(`\n\n${text}\n\n`);
        }
      }
    }

    const body = doc.body;
    if (!body) return { title: '', markdown: '' };
    const main = body.querySelector('main, article, [role="main"]') || body;
    if (!skipped(main) || main === body) walk(main);

    const markdown = out.join('').replace(/\n{3,}/g, '\n\n').trim();
    return { title: collapse(doc.title) || collapse(doc.querySelector('h1')?.textContent) || 'Page', markdown };
  }

  const api = { toMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.LIVIAPage = api;
}(typeof self !== 'undefined' ? self : globalThis));
