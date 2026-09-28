---
title: Speling Fixture wiht a typo in the front matter
---

# Spelling fixture

## English prose with mistakes

This sentance has a few mistaks in it, and so does this seccond one.

## Arabic paragraph with one mistake

مرحبا بكمم في هذا التطبيق (the second word has an extra letter, so it should be flagged with
Arabic ticked).

## Mixed English and Arabic line

Hello مرحبا there — both words are spelled correctly, so this line is clean with English and
Arabic both ticked, but مرحبا is flagged with English only (it isn't an English word).

## Not spell-checked at all

Fenced code block:

```
this is codee and should not be flagged, wiht included
```

Inline code: `this is codee too, wiht included`

A bare URL: http://example.com/wiht

An HTML tag's own markup (only the tag, not any text around it):
<span data-note="wiht">tag content, checked normally</span>

Inline maths: $x^{wiht} + y_{wiht}$

Block maths:

$$
a^{wiht} + b^{wiht} = c^{wiht}
$$

A HEX colour code: #AA00BB

[ref]: http://example.com/refwiht "titlewiht"

## Destinations are skipped, but link and image text is still checked

A link with a misspelled label and a misspelled destination:
[linnk labl wiht mistaks](http://example.com/desttination-wiht)

An image with a misspelled alt text and a misspelled destination:
![alt txt wiht mistak](images/pic-wiht.png)

A reference-style link, using the definition above: [ref].
