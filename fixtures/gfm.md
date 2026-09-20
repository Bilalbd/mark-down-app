# GFM Fixture

This file exercises the **GitHub Flavored Markdown** features the viewer must support.

## Text formatting

Plain, *italic*, **bold**, ***bold italic***, ~~strikethrough~~, `inline code`, and a [link](https://example.com).
Autolink: https://github.com and an email <someone@example.com>.

> A blockquote with **bold** text.
>
> > Nested quote.

## Lists

1. First
2. Second
   - Nested bullet
   - Another
     1. Deep ordered
3. Third

- [x] Completed task
- [ ] Open task
- [ ] Another open task

## Table

| Feature | VS Code | Obsidian | This app |
|:--------|:-------:|:--------:|---------:|
| Tables  | ✓       | ✓        | ✓        |
| Tasks   | ✓       | ✓        | ✓        |
| Math    | ✗       | ✓        | ✓        |

## Code

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

```python
def fib(n: int) -> int:
    return n if n < 2 else fib(n - 1) + fib(n - 2)
```

```
plain fenced block without a language
```

## Image

![Sample image](images/sample.png)

## Footnote

Here is a footnote reference.[^1]

[^1]: And here is the footnote.

---

### Heading level 3

#### Heading level 4

##### Heading level 5

###### Heading level 6

Inline HTML: <kbd>Ctrl</kbd>+<kbd>S</kbd> and <sub>sub</sub>/<sup>sup</sup>.

<script>alert('this must be stripped')</script>
