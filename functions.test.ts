import * as fn from "./functions";

const frontmatter = {
	year: 1975,
	price: 7.5,
	firstname: "Oscar",
	lastname: "Wilde",
	parents: ["[[William]]", "[[Jane]]"],
	friends: ["Alice", "Bob"],
	colleagues: ["Carol", "Dave"],
	scores: [10, 20, 15],
};

function render(template: string) {
	const match = template.match(/^\{\{\s*([^}]+)\s*\}\}$/);
	if (!match) throw new Error("Invalid template");
	let key = match[1];
	let prefix = false;
	if (key.startsWith("!")) {
		prefix = true;
		key = key.replace(/^!\s*/, "");
	}
	const value = fn.parse(key, frontmatter);
	return fn.render(value, key, prefix);
}

describe("tests: parse() and render() function calls", () => {
	it("{{ year }}", () => {
		expect(render("{{ year }}")).toBe("1975");
	});
	it("{{ price }}", () => {
		expect(render("{{ price }}")).toBe("7.5");
	});
	it("{{ !price }}", () => {
		expect(render("{{ ! price }}")).toBe("<b>Price: </b>7.5");
	});
	it("{{ firstname }}", () => {
		expect(render("{{ firstname }}")).toBe("Oscar");
	});
	it("{{ parents }}", () => {
		expect(render("{{ parents }}")).toBe(
			'<a class="internal-link" data-href="William" href="William">William</a><br />' +
				'<a class="internal-link" data-href="Jane" href="Jane">Jane</a>'
		);
	});
	it("{{ firstname + lastname }}", () => {
		expect(render("{{ firstname + lastname }}")).toBe("OscarWilde");
	});
	it("{{ upper(firstname) }}", () => {
		expect(render("{{ upper(firstname) }}")).toBe("OSCAR");
	});
	it("{{ lower(lastname) }}", () => {
		expect(render("{{ lower(lastname) }}")).toBe("wilde");
	});
	it("{{ first(firstname) + last(lastname) }}", () => {
		expect(render("{{ first(firstname) + last(lastname) }}")).toBe("Oe");
	});
	it("{{ highest(firstname) }}", () => {
		expect(render("{{ highest(firstname) }}")).toBe("srOca");
	});
	it("{{ lowest(firstname) - ac }}", () => {
		expect(render("{{ lowest(firstname) - ac }}")).toBe("Ors");
	});
	it("{{ join(friends, colleagues) }}", () => {
		expect(render("{{ join(friends, colleagues) }}")).toBe(
			"Alice, Bob, Carol, Dave"
		);
	});
	it("{{ upper(friends - Bob) }}", () => {
		expect(render("{{ upper(friends - Bob) }}")).toBe("ALICE");
	});
	it("{{ size(friends, colleagues) }}", () => {
		expect(render("{{ size(friends, colleagues) }}")).toBe("4");
	});
	it("{{ first(friends, colleagues) }}", () => {
		expect(render("{{ first(friends, colleagues) }}")).toBe("Alice");
	});
	it("{{ last(friends, colleagues) }}", () => {
		expect(render("{{ last(friends, colleagues) }}")).toBe("Dave");
	});
	it("{{ join(highest(scores)) }}", () => {
		expect(render("{{ join(highest(scores)) }}")).toBe("20, 15, 10");
	});
	it("{{ join(lowest(scores, 5, 25)) }}", () => {
		expect(render("{{ join(lowest(scores, 5, 25)) }}")).toBe(
			"5, 10, 15, 20, 25"
		);
	});
	it("{{ first(highest(scores)) }}", () => {
		expect(render("{{ first(highest(scores)) }}")).toBe("20");
	});
	it("{{ first(lowest(scores)) }}", () => {
		expect(render("{{ first(lowest(scores)) }}")).toBe("10");
	});
	it("{{ first(year) }}", () => {
		expect(render("{{ first(year) }}")).toBe("1");
	});
	it("{{ last(year) }}", () => {
		expect(render("{{ last(year) }}")).toBe("5");
	});
	it("{{ size(price) }}", () => {
		expect(render("{{ size(price) }}")).toBe("3");
	});
	it("{{ last(year) + first(price) }}", () => {
		expect(render("{{ last(year) + first(price) }}")).toBe("12");
	});
	it("{{ highest(year) }}", () => {
		expect(render("{{ highest(year) }}")).toBe("9751");
	});
	it("{{ lowest(year) }}", () => {
		expect(render("{{ lowest(year) }}")).toBe("1579");
	});
	it("{{ upper(price) }}", () => {
		expect(render("{{ upper(price) }}")).toBe("8");
	});
	it("{{ lower(price) }}", () => {
		expect(render("{{ lower(price) }}")).toBe("7");
	});
	it("{{ upper(firstname, friends, colleagues, lastname) }}", () => {
		expect(
			render("{{ upper(firstname, friends, colleagues, lastname) }}")
		).toBe("OSCAR<br />ALICE<br />BOB<br />CAROL<br />DAVE<br />WILDE");
	});
	it("{{ lower(firstname + lastname) + year }}", () => {
		expect(render("{{ lower(firstname + lastname) + year }}")).toBe(
			"oscarwilde1975"
		);
	});
});
