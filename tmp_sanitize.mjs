import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';

const HIGHLIGHT_SANITIZE_SCHEMA = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames || []), "mark"],
    attributes: {
        ...defaultSchema.attributes,
        mark: [
            ...((defaultSchema.attributes && "mark" in defaultSchema.attributes
                ? defaultSchema.attributes.mark
                : []) || []),
            "className",
            "data-id",
            "data-color",
            "data-note",
        ],
    },
};

const htmlStr = `<mark class="bg-yellow" data-id="1234" data-note="hello">test</mark>`;

unified()
    .use(remarkParse)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    .use(rehypeSanitize, HIGHLIGHT_SANITIZE_SCHEMA)
    .use(rehypeStringify)
    .process(htmlStr)
    .then(file => console.log("OUTPUT:", String(file)));
