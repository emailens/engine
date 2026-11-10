import { describe, expect, test } from "bun:test";
import { explainDesign } from "../design/explain";
import type { Component, Kept } from "../design/kept";

const whole: Kept = {
	content: 1,
	columns: 1,
	width: 1,
	changed: {},
	lost: [],
	components: [],
};
const part = (
	text: string,
	kind: Component["kind"],
	design: string,
	client: string,
	breaks = false,
): Component => ({ text, kind, design, client, breaks });

describe("explainDesign", () => {
	test("kept: says the design holds, with nothing to list", () => {
		const e = explainDesign({ verdict: "kept", kept: whole }, "Gmail");
		expect(e.sentence).toBe(
			"Gmail keeps your layout, sizes, colours and fonts as you set them.",
		);
		expect(e.reasons).toEqual([]);
	});

	// Skeyon in Outlook Classic, 2026-11-11: score 91, design broken.
	test("broken: names the element and every way it is wrong", () => {
		const e = explainDesign(
			{
				verdict: "broken",
				kept: {
					...whole,
					components: [
						part("Suscribirme", "moved", "centre at 13%", "centre at 9%"),
						part("Suscribirme", "resized", "140px", "96px"),
						part("Suscribirme", "corners", "8px", "0px"),
					],
				},
			},
			"Outlook Classic",
		);
		expect(e.sentence).toBe("Outlook Classic breaks your design.");
		expect(e.reasons).toEqual([
			"“Suscribirme” is moved (centre at 13% → 9% across the email), 96px wide instead of 140px, and loses its rounded corners (8px → square).",
		]);
	});

	test("broken: lost content is named, the rest counted", () => {
		const e = explainDesign(
			{
				verdict: "broken",
				kept: {
					...whole,
					content: 0.5,
					lost: ["Hola", "logo.png", "Shop now", "Terms"],
				},
			},
			"Yahoo",
		);
		expect(e.reasons).toEqual([
			"4 parts of your email do not show: “Hola”, the image “logo.png”, “Shop now” and 1 more.",
		]);
	});

	test("broken: stacked columns and a wrong width are said plainly", () => {
		const e = explainDesign(
			{ verdict: "broken", kept: { ...whole, columns: 0, width: 0.5 } },
			"Gmail",
		);
		expect(e.reasons).toEqual([
			"Columns that sit side by side in your design stack on top of each other.",
			"The email is drawn at a very different width from your design (50% of it).",
		]);
	});

	test("broken first, then what only changes", () => {
		const e = explainDesign(
			{
				verdict: "broken",
				kept: {
					...whole,
					components: [
						part("Logo", "corners", "6px", "0px"),
						part("hero.jpg", "resized", "600px", "240px", true),
					],
				},
			},
			"Gmail",
		);
		expect(e.reasons).toEqual([
			"The image “hero.jpg” is 240px wide instead of 600px.",
			"“Logo” loses its rounded corners (6px → square).",
		]);
	});

	test("an image's file name is decoded and a long one shortened, keeping its type", () => {
		const e = explainDesign(
			{
				verdict: "broken",
				kept: {
					...whole,
					components: [
						part(
							"1766005991947_Logo=Make,%20Dark=False,%20Size=Large.png",
							"resized",
							"300px",
							"1200px",
							true,
						),
					],
				},
			},
			"Outlook",
		);
		expect(e.reasons).toEqual([
			"The image “1766005991947_Logo=Make, Dark=…png” is 1200px wide instead of 300px.",
		]);
	});

	test("changed: one line per kind of change, with an example", () => {
		const e = explainDesign(
			{
				verdict: "changed",
				kept: {
					...whole,
					changed: {
						type: {
							count: 3,
							example: {
								text: "Hola",
								prop: "font-family",
								design: "Poppins",
								client: "Arial",
							},
						},
						spacing: {
							count: 1,
							example: {
								text: "Read more",
								prop: "padding-top",
								design: "16px",
								client: "0px",
							},
						},
					},
				},
			},
			"Outlook",
		);
		expect(e.sentence).toBe(
			"Outlook keeps your layout but changes how it looks.",
		);
		expect(e.reasons).toEqual([
			"Text style: “Hola” has font Arial instead of Poppins (3 changes).",
			"Spacing: “Read more” has padding top 0px instead of 16px.",
		]);
	});

	test("a box with no text is a box, a picture is named as one", () => {
		const e = explainDesign(
			{
				verdict: "changed",
				kept: {
					...whole,
					components: [
						part("td", "fill", "rgb(255, 0, 0)", "rgba(0, 0, 0, 0)"),
						part(
							"shoe.png",
							"resized",
							"background-size: cover",
							"background-size: auto",
							true,
						),
					],
				},
			},
			"Yahoo",
		);
		expect(e.reasons).toEqual([
			"The image “shoe.png” has its picture drawn at the wrong size (cover → auto).",
			"A box loses its background (rgb(255, 0, 0) → none).",
		]);
	});

	test("long lists end with how many more", () => {
		const changed = Object.fromEntries(
			(
				[
					"layout",
					"spacing",
					"corners",
					"borders",
					"color",
					"type",
					"effects",
				] as const
			).map((a) => [
				a,
				{
					count: 1,
					example: { text: "x", prop: "width", design: "1", client: "2" },
				},
			]),
		);
		const e = explainDesign(
			{ verdict: "changed", kept: { ...whole, changed } },
			"Gmail",
		);
		expect(e.reasons.length).toBe(5);
		expect(e.more).toBe(2);
	});
	test("copies of one element are said once", () => {
		const e = explainDesign(
			{
				verdict: "broken",
				kept: {
					...whole,
					content: 0.5,
					lost: ["hero.png", "hero.png"],
					components: [
						part("icon.png", "resized", "50px", "27px"),
						part("icon.png", "resized", "50px", "27px"),
					],
				},
			},
			"Apple Mail",
		);
		expect(e.reasons).toEqual([
			"2 parts of your email do not show: the image “hero.png” (2 copies).",
			"The image “icon.png” is 27px wide instead of 50px.",
		]);
	});

	test("square corners are said once, on the element", () => {
		const e = explainDesign(
			{
				verdict: "changed",
				kept: {
					...whole,
					components: [part("Go", "corners", "8px", "0px")],
					changed: {
						corners: {
							count: 1,
							example: {
								text: "Go",
								prop: "border-radius",
								design: "8px",
								client: "0px",
							},
						},
					},
				},
			},
			"Outlook",
		);
		expect(e.reasons).toEqual([
			"“Go” loses its rounded corners (8px → square).",
		]);
	});
	test("a font is named by its first family; long text is cut at 40", () => {
		const long = "Tested on the most popular email clients and devices";
		const e = explainDesign(
			{
				verdict: "changed",
				kept: {
					...whole,
					changed: {
						type: {
							count: 1,
							example: {
								text: long,
								prop: "font-family",
								design: '"Poppins", Arial, sans-serif',
								client: "'Segoe UI', Calibri",
							},
						},
					},
				},
			},
			"Outlook",
		);
		expect(e.reasons).toEqual([
			"Text style: “Tested on the most popular email client…” has font Segoe UI instead of Poppins.",
		]);
		const forty = "x".repeat(40);
		expect(
			explainDesign(
				{
					verdict: "changed",
					kept: {
						...whole,
						components: [part(forty, "corners", "8px", "4px")],
					},
				},
				"Gmail",
			).reasons,
		).toEqual([`“${forty}” has 4px corners instead of 8px.`]);
	});
});
