export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPiBody(text) {
  return escapeHtml(text)
    .replace(/&lt;tool&gt;([\s\S]*?)&lt;\/tool&gt;/g, '<span class="tool-ref">$1</span>')
    .replace(/&lt;code&gt;([\s\S]*?)&lt;\/code&gt;/g, '<code>$1</code>')
    .replace(/&lt;cursor&gt;&lt;\/cursor&gt;/g, '<span class="cursor"></span>');
}

export function renderBannerBody(text) {
  return escapeHtml(text)
    .replace(/&lt;a&gt;([\s\S]*?)&lt;\/a&gt;/g, '<span class="accent">$1</span>')
    .replace(/&lt;d&gt;([\s\S]*?)&lt;\/d&gt;/g, '<span class="dim">$1</span>')
    .replace(/&lt;t&gt;([\s\S]*?)&lt;\/t&gt;/g, '<span class="tool">$1</span>');
}

export function renderAnsiBody(text) {
  const tagMap = {
    a: "ansi-green",
    r: "ansi-red",
    y: "ansi-yellow",
    c: "ansi-cyan",
    d: "ansi-dim",
    t: "ansi-yellow",
    ad: "added",
    rm: "removed",
  };
  let html = escapeHtml(text);
  for (const [tag, cls] of Object.entries(tagMap)) {
    html = html.replace(new RegExp(`&lt;${tag}&gt;([\\s\\S]*?)&lt;\\/${tag}&gt;`, "g"), `<span class="${cls}">$1</span>`);
  }
  return html;
}

export function renderTree(nodes) {
  return nodes.map((node) => {
    const open = !!node.open;
    const action = node.type === "dir" ? "toggle-tree-node" : "open-file";
    const expanded = node.type === "dir" ? ` aria-expanded="${open}"` : "";
    const cls = ["tree-node", node.type, node.status || ""].filter(Boolean).join(" ");
    const padding = `padding-left:calc(var(--space-3) + ${node.depth * 14}px)`;
    const caret = node.type === "dir" ? (open ? "▾" : "▸") : "";
    const glyph = node.type === "dir" ? (open ? "▾" : "▸") : "·";
    const filePath = escapeHtml(node.path || node.name);
    const children = node.children ? `<div data-tree-children${open ? "" : " hidden"}>${renderTree(node.children)}</div>` : "";
    return `<div class="tree-branch"><button type="button" class="${cls}" data-action="${action}" data-file-path="${filePath}" style="${padding}"${expanded}><span class="caret">${caret}</span><span class="glyph">${glyph}</span><span class="name">${escapeHtml(node.name)}</span></button>${children}</div>`;
  }).join("");
}

