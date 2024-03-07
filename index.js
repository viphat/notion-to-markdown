require('dotenv').config()

const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");
const fs = require('fs');

const notion = new Client({ auth: process.env.NOTION_TOKEN });

const n2m = new NotionToMarkdown({ notionClient: notion });

(async () => {
  const mdblocks = await n2m.pageToMarkdown("b16a78ccc5464df9a3f33ef48904f8cd");
  const mdString = n2m.toMarkdownString(mdblocks);
  // Write the markdown string to a file
  console.log(mdString.parent);
  fs.writeFileSync('./output.md', mdString.parent);
})();