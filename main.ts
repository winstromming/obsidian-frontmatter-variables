import { App, debounce, MarkdownView, Plugin, TFile } from "obsidian";
import { setTimeout } from "timers";

export default class FrontmatterVariables extends Plugin {
	debounced = debounce(this.find.bind(this), 100, true);

	async onload() {
		this.registerMarkdownPostProcessor((element, context) => {
			const file = this.app.vault.getFileByPath(context.sourcePath);
			if (!file) return;
			const cache = this.app.metadataCache.getFileCache(file);
			if (!cache?.frontmatter) return;
			this.replace(element);
			this.update(element, cache.frontmatter);
		});

		this.registerEvent(
			this.app.metadataCache.on("changed", (file) => this.refresh(file))
		);
		this.registerEvent(
			this.app.metadataCache.on("resolve", (file) => this.refresh(file))
		);

		this.registerEvent(
			this.app.workspace.on("active-leaf-change", () => {
				const view =
					this.app.workspace.getActiveViewOfType(MarkdownView);
				if (view?.getMode() === "preview") this.debounced();
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

	stringify(str: string | number, app: App): string {
		if (typeof str === "string" && /^\[\[[^\]]+\]\]$/.test(str.trim())) {
			const match = str.match(/^\[\[([^\]|]+)(\|([^\]]+))?\]\]$/);
			if (!match) return str;
			const target = match[1].trim();
			const display = match[3] ? match[3].trim() : target;
			const file = app.metadataCache.getFirstLinkpathDest(target, "");
			if (file) {
				return `<a href="#${encodeURIComponent(
					file.path
				)}">${display}</a>`;
			} else {
				return `<span class="broken-link">${display}</span>`;
			}
		}
		return typeof str === "string" ? str : String(str);
	}

	replace(element: HTMLElement) {
		const pattern = /\{\{\s*([\w\-_.]+)\s*\}\}/g;
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
				const [fullMatch, key] = match;
				if (match.index > lastIndex) {
					fragment.appendChild(
						document.createTextNode(
							text.slice(lastIndex, match.index)
						)
					);
				}
				const span = document.createElement("span");
				span.setAttribute("data-property", key);
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

	update(
		element: Element,
		frontmatter: Record<string, string | number | string[] | number[]>
	) {
		const spans = Array.from(
			element.querySelectorAll("span[data-property]")
		);
		for (const span of spans) {
			const key = span.getAttribute("data-property");
			if (!key) continue;
			const value = frontmatter[key];
			span.innerHTML = "";
			if (value === undefined || value === null) continue;
			if (Array.isArray(value)) {
				const html = value
					.map((item) => this.stringify(item, this.app))
					.join(", ");
				span.innerHTML = html;
			} else {
				const rendered = this.stringify(value, this.app);
				span.innerHTML =
					rendered === value ? this.escape(String(value)) : rendered;
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
		const previewing = view.previewMode?.containerEl?.querySelector(
			".markdown-preview-view"
		);
		if (!previewing) return;
		this.update(previewing, frontmatter);
	}

	escape(str: string) {
		return str.replace(/[&<>"']/g, (c) => escapes[c] || c);
	}

	onunload() {
		if (this.debounced) {
			this.debounced.cancel();
		}
	}
}

const escapes: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};
