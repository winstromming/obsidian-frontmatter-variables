import { debounce, MarkdownView, Plugin, TFile } from "obsidian";
import { parse, render } from "./functions";

const ATTR_KEY = "data-frontmatter-variable-key";
const ATTR_PREFIX = "data-frontmatter-variable-prefix";
const PREFIX_SYMBOL = "!";

// Regex for matching {{variable}} or {{!variable}}
const TEMPLATE_PATTERN = new RegExp(
	`\{\{\s*${PREFIX_SYMBOL}?\s*([^}}]+?)\s*\}\}`,
	"g"
);

// Helper to parse key and prefix from a match
function parseKeyAndPrefix(
	fullMatch: string,
	key: string
): { key: string; prefix: boolean } {
	let prefix = false;
	key = key.trim();
	if (key.startsWith(`${PREFIX_SYMBOL}`)) {
		key = key.slice(PREFIX_SYMBOL.length);
		prefix = true;
	}
	if (
		fullMatch.startsWith(`{{${PREFIX_SYMBOL}`) ||
		fullMatch.startsWith(`{{ ${PREFIX_SYMBOL}`)
	) {
		prefix = true;
	}
	return { key, prefix };
}

// Helper to find all text nodes in an element (excluding code/pre)
function findTextNodes(element: HTMLElement): Text[] {
	const textNodes: Text[] = [];
	const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
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
	});
	let node: Text | null;
	while ((node = walker.nextNode() as Text | null)) textNodes.push(node);
	return textNodes;
}

// Helper to update a single span
function updateSpan(span: Element, frontmatter: Record<string, any>) {
	const key = span.getAttribute(ATTR_KEY);
	const prefix = span.getAttribute(ATTR_PREFIX);
	if (!key) return;
	const value = parse(key, frontmatter);
	if (value === undefined || value === null) return;
	while (span.firstChild) span.removeChild(span.firstChild);
	const frag = render(value, key, !!prefix, { toDOM: true });
	if (typeof frag === "string") {
		span.appendChild(document.createTextNode(frag));
	} else {
		span.appendChild(frag);
	}
}

export default class FrontmatterVariablesPlugin extends Plugin {
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

	replace(element: HTMLElement) {
		const textNodes = findTextNodes(element);
		for (const textNode of textNodes) {
			const text = textNode.nodeValue;
			if (!text || !text.includes("{{")) continue;
			let match;
			let lastIndex = 0;
			let found = false;
			TEMPLATE_PATTERN.lastIndex = 0;
			const fragment = document.createDocumentFragment();
			while ((match = TEMPLATE_PATTERN.exec(text)) !== null) {
				found = true;
				const [fullMatch, key] = match;
				const { key: parsedKey, prefix } = parseKeyAndPrefix(
					fullMatch,
					key
				);
				if (match.index > lastIndex) {
					fragment.appendChild(
						document.createTextNode(
							text.slice(lastIndex, match.index)
						)
					);
				}
				const span = document.createElement("span");
				span.setAttribute(ATTR_KEY, parsedKey);
				if (prefix) span.setAttribute(ATTR_PREFIX, "true");
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

	update(element: Element, frontmatter: Record<string, any>) {
		const spans = Array.from(
			element.querySelectorAll("span[" + ATTR_KEY + "]")
		);
		for (const span of spans) {
			updateSpan(span, frontmatter);
		}
	}

	async find(file: TFile | null) {
		const view = this.app.workspace.getActiveViewOfType(MarkdownView);
		if (!view || !view.file || view.getMode() !== "preview") return;
		if (file && view.file?.path !== file?.path) return;
		const cache = this.app.metadataCache.getFileCache(view.file);
		const frontmatter = cache?.frontmatter || {};
		const previewing = view.containerEl.querySelector(
			".markdown-preview-view"
		);
		if (!previewing) return;
		this.update(previewing, frontmatter);
	}

	onunload() {
		this.debounced.cancel();
	}
}
