import { debounce, MarkdownView, Plugin, TFile } from "obsidian";

const ATTR_KEY = "data-frontmatter-variable-key";
const ATTR_PREFIX = "data-frontmatter-variable-prefix";
const ATTR_SPREAD = "data-frontmatter-variable-spread";

const PREFIX_SYMBOL = "!";
const SPREAD_SYMBOL = "...";

export default class FrontmatterVariables extends Plugin {
	debounced = debounce(this.find.bind(this), 100, true);

	async onload() {
		this.registerMarkdownPostProcessor((element, context) => {
			const file = this.app.vault.getFileByPath(context.sourcePath);
			if (!file) return;
			const attempt = (attempts = 0) => {
				const cache = this.app.metadataCache.getFileCache(file);
				if (cache?.frontmatter) {
					this.replace(element);
					this.update(element, cache.frontmatter);
				} else if (attempts < 5) {
					setTimeout(() => attempt(attempts + 1), 250);
				}
			};
			attempt();
		});

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => this.refresh(file))
		);
		this.registerEvent(
			this.app.metadataCache.on("resolve", (file) => this.refresh(file))
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", (leaf) => {
				if (
					leaf?.view instanceof MarkdownView &&
					leaf?.view.getMode() === "preview"
				)
					this.debounced();
			})
		);
	}

	refresh(file: TFile) {
		const view = this.app?.workspace?.getActiveViewOfType(MarkdownView);
		if (view?.file?.path === file.path && view?.getMode() === "preview") {
			view.previewMode.rerender(true);
			setTimeout(() => this.debounced(file), 50);
		}
	}

	linkify(str: string | number): string {
		if (typeof str === "string" && /^\[\[[^\]]+\]\]$/.test(str.trim())) {
			const match = str.match(/^\[\[([^\]|]+)(\|([^\]]+))?\]\]$/);
			if (!match) return str;
			const target = match[1].trim();
			const display = match[3] ? match[3].trim() : target;
			return `<a class="internal-link" data-href="${display}" href="${display}">${display}</a>`;
		}
		return typeof str === "string" ? str : String(str);
	}

	replace(element: HTMLElement) {
		const escapedSpread = SPREAD_SYMBOL.replace(
			/[.*+?^${}()|[\]\\]/g,
			"\\$&"
		);
		const pattern = new RegExp(
			`\\{\\{\\s*${PREFIX_SYMBOL}?\\s*([\\w\\s\\+\\-_.]+?)\\s*(${escapedSpread})?\\s*\\}\\}`,
			"g"
		);
		const textNodes: Text[] = [];
		const walker = document.createTreeWalker(
			element,
			NodeFilter.SHOW_TEXT,
			{
				acceptNode: (node) => {
					const parent = node.parentElement;
					if (
						parent?.tagName === "CODE" ||
						parent?.tagName === "PRE" ||
						parent?.closest("code, pre") ||
						parent?.dataset?.property
					) {
						return NodeFilter.FILTER_REJECT;
					}
					return NodeFilter.FILTER_ACCEPT;
				},
			}
		);
		let node: Text | null;
		while ((node = walker.nextNode() as Text | null)) {
			textNodes.push(node);
		}
		for (const textNode of textNodes) {
			const text = textNode.nodeValue;
			if (!text || !text.includes("{{")) continue;
			let match;
			let lastIndex = 0;
			let found = false;
			pattern.lastIndex = 0;
			const fragment = document.createDocumentFragment();
			while ((match = pattern.exec(text)) !== null) {
				found = true;
				let [fullMatch, key] = match;
				if (key.startsWith(`${PREFIX_SYMBOL}`))
					key = key.slice(PREFIX_SYMBOL.length);
				if (key.startsWith(` ${PREFIX_SYMBOL}`))
					key = key.slice(PREFIX_SYMBOL.length + 1);
				if (key.endsWith(`${SPREAD_SYMBOL}`))
					key = key.slice(0, -SPREAD_SYMBOL.length);
				if (key.endsWith(`${SPREAD_SYMBOL} `))
					key = key.slice(0, -(SPREAD_SYMBOL.length + 1));
				key = key.trim();
				if (match.index > lastIndex) {
					fragment.appendChild(
						document.createTextNode(
							text.slice(lastIndex, match.index)
						)
					);
				}
				const span = document.createElement("span");
				span.setAttribute(ATTR_KEY, key);
				if (
					fullMatch.startsWith(`{{${PREFIX_SYMBOL}`) ||
					fullMatch.startsWith(`{{ ${PREFIX_SYMBOL}`)
				)
					span.setAttribute(ATTR_PREFIX, "true");
				if (
					fullMatch.endsWith(`${SPREAD_SYMBOL}}}`) ||
					fullMatch.endsWith(`${SPREAD_SYMBOL} }}`)
				)
					span.setAttribute(ATTR_SPREAD, "true");
				fragment.appendChild(span);
				lastIndex = match.index + fullMatch.length;
			}
			if (found) {
				if (lastIndex < text.length) {
					fragment.appendChild(
						document.createTextNode(text.slice(lastIndex))
					);
				}
				textNode.parentNode?.replaceChild(fragment, textNode);
			}
		}
	}

	parse(
		key: string,
		frontmatter: Record<string, any>
	): string | number | string[] | number[] | undefined {
		const parts = key
			.split(/([+-])/)
			.map((s) => s.trim())
			.filter(Boolean);
		if (parts.length === 1) {
			let v = frontmatter[parts[0]];
			if (v === undefined) {
				const num = Number(parts[0]);
				v = !isNaN(num) && parts[0].trim() !== "" ? num : parts[0];
			}
			return v;
		}

		let values: any[] = [];
		let ops: string[] = [];
		for (let i = 0; i < parts.length; i++) {
			if (i % 2 === 0) {
				let v = frontmatter[parts[i]];
				if (v === undefined) {
					const num = Number(parts[i]);
					v = !isNaN(num) && parts[i].trim() !== "" ? num : parts[i];
				}
				values.push(v);
			} else {
				ops.push(parts[i]);
			}
		}

		if (values.some((v) => v === undefined || v === null)) return undefined;

		if (values.some(Array.isArray)) {
			let result: any[] = Array.isArray(values[0])
				? [...values[0]]
				: [values[0]];
			for (let i = 1; i < values.length; i++) {
				let val = values[i];
				if (!Array.isArray(val)) val = [val];
				if (ops[i - 1] === "+") result = result.concat(val);
				else if (ops[i - 1] === "-")
					result = result.filter((x) => !val.includes(x));
			}
			return result;
		}
		if (values.every((v) => typeof v === "number")) {
			let result = values[0];
			for (let i = 1; i < values.length; i++) {
				if (ops[i - 1] === "+") result += values[i];
				else if (ops[i - 1] === "-") result -= values[i];
			}
			return result;
		}
		if (values.every((v) => typeof v === "string")) {
			let result = values[0];
			for (let i = 1; i < values.length; i++) {
				if (ops[i - 1] === "+") result += " " + values[i];
				else if (ops[i - 1] === "-")
					result = result.replace(values[i], "");
			}
			return result;
		}
		return values.join(" ");
	}

	update(
		element: Element,
		frontmatter: Record<string, string | number | string[] | number[]>
	) {
		const spans = Array.from(
			element.querySelectorAll("span[" + ATTR_KEY + "]")
		);
		for (const span of spans) {
			const key = span.getAttribute(ATTR_KEY);
			const prefix = span.getAttribute(ATTR_PREFIX);
			const spread = span.getAttribute(ATTR_SPREAD);
			if (!key) continue;

			const value = this.parse(key, frontmatter);

			while (span.firstChild) span.removeChild(span.firstChild);
			if (value === undefined || value === null) continue;

			const appendPrefix = () => {
				const b = document.createElement("b");
				b.textContent = capitalise(key) + ": ";
				span.appendChild(b);
				if (Array.isArray(value) && !spread)
					span.appendChild(document.createElement("br"));
			};
			if (Array.isArray(value)) {
				if (prefix) appendPrefix();
				value.forEach((item, idx) => {
					const rendered = this.linkify(item);
					if (/<[a-z][\s\S]*>/i.test(rendered)) {
						const parser = new DOMParser();
						const doc = parser.parseFromString(
							rendered,
							"text/html"
						);
						Array.from(doc.body.childNodes).forEach((node) =>
							span.appendChild(node)
						);
					} else {
						span.appendChild(document.createTextNode(rendered));
					}
					if (idx < value.length - 1) {
						if (spread) {
							span.appendChild(document.createTextNode(", "));
						} else {
							span.appendChild(document.createElement("br"));
						}
					}
				});
			} else {
				if (prefix) appendPrefix();
				const rendered = this.linkify(value);
				if (/<[a-z][\s\S]*>/i.test(rendered)) {
					const parser = new DOMParser();
					const doc = parser.parseFromString(rendered, "text/html");
					Array.from(doc.body.childNodes).forEach((node) =>
						span.appendChild(node)
					);
				} else {
					span.appendChild(
						document.createTextNode(
							rendered === value
								? escape(String(value))
								: rendered
						)
					);
				}
			}
		}
	}

	async find(file: TFile) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || view.getMode() !== "preview") return;
		if (file && view.file?.path !== file.path) return;
		const current = view.file;
		if (!current) return;
		const cache = this.app.metadataCache.getFileCache(current);
		const frontmatter = cache?.frontmatter || {};
		const previewing = view.containerEl.querySelector(
			".markdown-preview-view"
		);
		if (!previewing) return;
		this.update(previewing, frontmatter);
	}

	onunload() {
		if (this.debounced) {
			this.debounced.cancel();
		}
	}
}

const escape = (str: string) => str.replace(/[&<>"']/g, (c) => escapes[c] || c);
const capitalise = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

const escapes: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};
