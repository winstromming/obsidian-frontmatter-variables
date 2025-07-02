// HTML escape character map
const escapes: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

// Type guard: is string
export const str = (val: unknown): val is string => typeof val === "string";
// Type guard: is number
export const num = (val: unknown): val is number => typeof val === "number";
// Type guard: is array
export const arr = (val: unknown): val is any[] => Array.isArray(val);

// Flattens nested arrays and removes null/undefined, returns single value if only one
export const flatten = (args: any[]): any | any[] => {
	let list = args.flat(Infinity).filter((x) => x !== undefined && x !== null);
	return list.length === 1 ? list[0] : list;
};

// Extracts the last number from a string, or returns original value
export const numberify = (val: any): number | any => {
	const numberMatch = String(val).match(/(-?\d+(?:\.\d+)?)(?!.*\d)/);
	return numberMatch ? parseFloat(numberMatch[1]) : val;
};

// Sort comparator: descending for numbers/strings
export const sort = (before: any, after: any) => {
	if (str(before) && str(after)) return after.localeCompare(before);
	if (num(before) && num(after)) return after - before;
	return String(after).localeCompare(String(before));
};

// Compares two values, optionally ascending/descending, using numberify for strings
export const compare = (a: any, b: any, dir: "asc" | "desc" = "desc") => {
	if (str(a)) a = numberify(a);
	if (str(b)) b = numberify(b);
	return dir === "desc" ? sort(a, b) : sort(b, a);
};

// Ascending/descending comparators
const asc = (a: any, b: any) => compare(a, b, "asc");
const desc = (a: any, b: any) => compare(a, b, "desc");

// Splits a function argument string, respecting nested parentheses
function split(argStr: string): string[] {
	const args = [];
	let depth = 0,
		last = 0;
	for (let i = 0; i < argStr.length; i++) {
		if (argStr[i] === "(") depth++;
		else if (argStr[i] === ")") depth--;
		else if (argStr[i] === "," && depth === 0) {
			args.push(argStr.slice(last, i).trim());
			last = i + 1;
		}
	}
	if (last < argStr.length) args.push(argStr.slice(last).trim());
	return args;
}

// Utility functions for template expressions (first, last, upper, lower, etc)
export const utility: Record<string, (...args: any[]) => any> = {
	first: (...args: any[]) => {
		const val = flatten(args);
		if (arr(val)) return val[0];
		if (str(val)) return val.charAt(0);
		if (num(val)) return String(val).charAt(0);
		return val;
	},
	last: (...args: any[]) => {
		const val = flatten(args);
		if (arr(val)) return val[val.length - 1];
		if (str(val)) return val.charAt(val.length - 1);
		if (num(val)) return String(val).charAt(String(val).length - 1);
		return val;
	},
	upper: (...args: any[]) => {
		const val = flatten(args);
		if (arr(val)) return val.map((v) => utility.upper(v));
		if (str(val)) return val.toUpperCase();
		if (num(val)) return Math.ceil(val);
		return val;
	},
	lower: (...args: any[]) => {
		const val = flatten(args);
		if (arr(val)) return val.map((v) => utility.lower(v));
		if (str(val)) return val.toLowerCase();
		if (num(val)) return Math.floor(val);
		return val;
	},
	highest: (...args: any[]) => {
		const val = flatten(args);
		if (arr(val)) return val.sort(desc);
		if (str(val)) return val.split("").sort(desc).join("");
		if (num(val)) return Number(String(val).split("").sort(desc).join(""));
		return val;
	},
	lowest: (...args: any[]) => {
		const val = flatten(args);
		if (arr(val)) return val.sort(asc);
		if (str(val)) return val.split("").sort(asc).join("");
		if (num(val)) return Number(String(val).split("").sort(asc).join(""));
		return val;
	},
	size: (...args: any[]) => {
		const val = flatten(args);
		if (arr(val)) return val.length;
		if (str(val)) return val.length;
		if (num(val)) return String(val).length;
		return JSON.stringify(val).length;
	},
	join: (...args: any[]) => {
		const val = flatten(args);
		if (arr(val)) return val.join(", ");
		return val;
	},
};

// Parses and evaluates a template expression against frontmatter
export function parse(key: string, frontmatter: Record<string, any>): any {
	const resolveInnermost = (expr: string): any => {
		let s = expr.trim();
		const results: Record<string, any> = {};
		const calling = s.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\((.*)\)$/);
		if (calling) {
			const [, funcName, argStr] = calling;
			const func = utility[funcName];
			if (func) {
				const parsed = split(argStr).map((a) => parse(a, frontmatter));
				return func.apply(null, parsed);
			}
		}
		const parent = s.match(/^\(([^()]+)\)$/);
		if (parent) {
			return parse(parent[1], frontmatter);
		}
		while (true) {
			const calling = s.match(/([a-zA-Z_][a-zA-Z0-9_]*)\(([^()]*)\)/);
			if (calling) {
				const [full, funcName, argStr] = calling;
				const func = utility[funcName];
				if (!func) break;
				const parsed = split(argStr).map((a) => parse(a, frontmatter));
				const result = func.apply(null, parsed);
				const token = `__FUNC_${Math.random().toString(36).slice(2)}__`;
				s = s.replace(full, token);
				results[token] = result;
				continue;
			}
			const parenMatch = s.match(/\(([^()]+)\)/);
			if (parenMatch) {
				const [full, inner] = parenMatch;
				const result = parse(inner, frontmatter);
				const token = `__PAREN_${Math.random()
					.toString(36)
					.slice(2)}__`;
				s = s.replace(full, token);
				results[token] = result;
				continue;
			}
			break;
		}
		for (const [token, value] of Object.entries(results)) {
			if (arr(value)) {
				s = s.replace(token, JSON.stringify(value));
			} else {
				s = s.replace(token, str(value) ? value : String(value));
			}
		}

		if (s in frontmatter) return frontmatter[s];
		const num = Number(s);
		if (!isNaN(num) && s.trim() !== "") return num;
		return s;
	};

	key = key.trim();
	const resolved = resolveInnermost(key);

	let depth = 0;
	let hasOp = false;
	for (let i = 0; i < key.length; i++) {
		if (key[i] === "(") depth++;
		else if (key[i] === ")") depth--;
		else if ((key[i] === "+" || key[i] === "-") && depth === 0) {
			hasOp = true;
			break;
		}
	}
	if (!hasOp) {
		return resolved;
	}
	const parts = [];
	let last = 0;
	depth = 0;
	for (let i = 0; i < key.length; i++) {
		if (key[i] === "(") depth++;
		else if (key[i] === ")") depth--;
		else if ((key[i] === "+" || key[i] === "-") && depth === 0) {
			parts.push(key.slice(last, i).trim());
			parts.push(key[i]);
			last = i + 1;
		}
	}
	if (last < key.length) parts.push(key.slice(last).trim());
	if (parts.length === 1) {
		return parse(parts[0], frontmatter);
	}

	let values: any[] = [];
	let ops: string[] = [];
	for (let i = 0; i < parts.length; i++) {
		if (i % 2 === 0) {
			let v = parse(parts[i], frontmatter);
			if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) {
				v = Number(v);
			}
			values.push(v);
		} else {
			ops.push(parts[i]);
		}
	}

	if (values.some((v) => v === undefined || v === null)) return undefined;
	if (values.some(Array.isArray)) {
		let result: any[] = arr(values[0]) ? [...values[0]] : [values[0]];
		for (let i = 1; i < values.length; i++) {
			let val = values[i];
			if (ops[i - 1] === "+") {
				result = result.concat(arr(val) ? val : [val]);
			} else if (ops[i - 1] === "-") {
				if (arr(val)) {
					result = result.filter((x) => !val.includes(x));
				} else {
					result = result.filter((x) => x !== val);
				}
			}
		}
		return result;
	}
	if (values.every(num)) {
		let result = values[0];
		for (let i = 1; i < values.length; i++) {
			if (ops[i - 1] === "+") result += values[i];
			else if (ops[i - 1] === "-") result -= values[i];
		}
		return result;
	}
	if (values.every(str)) {
		let result = values[0];
		for (let i = 1; i < values.length; i++) {
			if (ops[i - 1] === "+") result += values[i];
			else if (ops[i - 1] === "-") result = result.replace(values[i], "");
		}
		return result;
	}
	return values.map(String).join(ops[0] === "+" ? "" : "");
}

// Escapes HTML special characters in a string
export const escape = (str: string) =>
	str.replace(/[&<>"']/g, (c) => escapes[c] || c);

// Capitalizes the first character of a string
export const capitalise = (str: string) =>
	str.charAt(0).toUpperCase() + str.slice(1);

// Extracts the first non-numeric variable name from an expression
export const extract = (expr: string) => {
	let cleaned = expr;
	while (true) {
		const calling = cleaned.match(/([a-zA-Z_][a-zA-Z0-9_]*)\(([^()]*)\)/);
		if (!calling) break;
		cleaned = cleaned.replace(calling[0], calling[2]);
	}
	const parts = cleaned
		.split(/[^a-zA-Z0-9_\-\.]+/)
		.map((s) => s.trim())
		.filter(Boolean);
	for (const part of parts) {
		if (!/^\d+(\.\d+)?$/.test(part)) {
			return part;
		}
	}
	return undefined;
};

// Renders a string as an Obsidian-style internal link if possible, else returns as string
export function link(input: string | number): string {
	if (str(input) && /^\[\[[^\]]+\]\]$/.test(input.trim())) {
		const match = input.match(/^\[\[([^\]|]+)(\|([^\]]+))?\]\]$/);
		if (!match) return input;
		const target = match[1].trim();
		const display = match[3] ? match[3].trim() : target;
		return `<a class="internal-link" data-href="${display}" href="${display}">${display}</a>`;
	}
	return str(input) ? input : String(input);
}

// Renders a value (string, array, etc) as HTML or DOM fragment for Obsidian preview
export function render(
	value: any,
	key?: string,
	prefix?: boolean,
	opts?: { toDOM?: boolean }
): string | DocumentFragment {
	const getPrefix = () => {
		let titleKey = key;
		if (prefix && key) {
			const firstKey = extract(key);
			if (firstKey) titleKey = firstKey;
		}
		return capitalise(titleKey ?? "") + ": ";
	};

	if (opts?.toDOM && typeof document !== "undefined") {
		const frag = document.createDocumentFragment();
		if (prefix) {
			const b = document.createElement("b");
			b.textContent = getPrefix();
			frag.appendChild(b);
			if (arr(value)) frag.appendChild(document.createElement("br"));
		}
		if (arr(value)) {
			value.forEach((item: any, idx: number) => {
				const html = link(item);
				if (/<[a-z][\s\S]*>/i.test(html)) {
					const parser = new DOMParser();
					const doc = parser.parseFromString(html, "text/html");
					Array.from(doc.body.childNodes).forEach((node) =>
						frag.appendChild(node)
					);
				} else {
					frag.appendChild(document.createTextNode(html));
				}
				if (idx < value.length - 1)
					frag.appendChild(document.createElement("br"));
			});
		} else {
			const html = link(value);
			if (/<[a-z][\s\S]*>/i.test(html)) {
				const parser = new DOMParser();
				const doc = parser.parseFromString(html, "text/html");
				Array.from(doc.body.childNodes).forEach((node) =>
					frag.appendChild(node)
				);
			} else {
				frag.appendChild(
					document.createTextNode(
						html === value ? escape(String(value)) : html
					)
				);
			}
		}
		return frag;
	} else {
		let out = "";
		if (prefix) {
			out += `<b>${getPrefix()}</b>`;
			if (arr(value)) out += "<br />";
		}
		if (arr(value)) {
			if (typeof key === "string" && /^\s*join\s*\(/i.test(key)) {
				out += value.join(", ");
			} else {
				out += value.map((item: any) => link(item)).join("<br />");
			}
		} else {
			const rendered = link(value);
			out += rendered === value ? escape(String(value)) : rendered;
		}
		return out;
	}
}
