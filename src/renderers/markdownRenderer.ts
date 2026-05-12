import MarkdownIt from "markdown-it";

const markdown = new MarkdownIt({
  breaks: false,
  html: false,
  linkify: true,
  typographer: true,
});

export function renderMarkdown(text: string): string {
  return markdown.render(text);
}
