# Colour swatch fixture

Every HEX code below should get a small square swatch right after it, in the formatted view
only (not in Source or Split's editor side). For inline code the swatch sits inside the same
code pill, right after the code text, so pill and swatch read as one chip; for plain text the
swatch sits right after the code, separated by a small gap.

## Inline code, every valid length

`#abc` `#ABCD` `#aabbcc` `#AABBCCDD` `#123` `#2024`

Inline code accepts an all-numeric 3/4-digit code too (`#123` and `#2024` above both get a
swatch, unlike the same codes in plain text below).

## Plain text

The old brand colour was #a1b2c3 and the new one is #FF00AA. A short one: #0f0. An eight-digit
one with alpha: #11223344.

## Non-matches (must have no swatch)

- All-numeric 3/4-digit codes in plain text: issue #123, year #2024.
- `C#` is a language, not a colour.
- An HTML entity: `&#123;`.
- A doubled hash: `##abc`.
- Too long / followed by a letter: `#abcdefg`.
- Followed by punctuation still matches: `#ABC.` should have a swatch on `#ABC`.

## Inside a link

A code inside link text should not get a swatch: [#AA00BB](https://example.com).

## Heading with a code

## Brand #AA00BB

## Table with codes

| Name | HEX |
|---|---|
| Sky | #6cb6ff |
| Rose | #ff6c9c |

## Fenced block (no swatches here)

```
#AA00BB
#fff
```

## Outline check

`#fff` and `#000` should both get an outlined swatch, visible on both light and dark themes.
(Written as inline code here since plain text only swatches all-digit 3/4-digit codes when
there's at least one letter a-f, as tested above with `#123`/`#2024`.)
