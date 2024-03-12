require('dotenv').config()

const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");
const slugify = require('slugify');

const fs = require('fs');
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

const datePropertyId = process.env.NOTION_DATE_PROPERTY_ID;
const titlePropertyId = process.env.NOTION_TITLE_PROPERTY_ID;
const categoriesPropertyId = process.env.NOTION_CATEGORIES_PROPERTY_ID;
const authorPropertyId = process.env.NOTION_AUTHOR_PROPERTY_ID;

// Get the page ID from the command line arguments
const pageId = process.argv[2];

const convertToMarkdown = async (pageId) => {
  const mdblocks = await n2m.pageToMarkdown(pageId);
  const mdString = n2m.toMarkdownString(mdblocks);
  fs.writeFileSync(`./output/${pageId}.md`, mdString.parent);
}

const retrievePageProperties = async (pageId) => {
  const page = await notion.pages.retrieve({ page_id: pageId });
  let date, title, categories, author;

  for (let propertyName in page.properties) {
    const property = page.properties[propertyName];

    if (property.id === datePropertyId) {
      date = new Date(property.date.start).toISOString().split('T')[0];
    } else if (property.id === titlePropertyId) {
      title = property.title[0].plain_text;
    } else if (property.id === categoriesPropertyId) {
      categories = property.multi_select.map((category) => category.name);
    } else if (property.id === authorPropertyId) {
      author = property.select.name;
    }
  }

  return [date, title, categories, author];
}

const createFrontMatter = (date, title, categories, author) => {
  const slug = slugify(title, {
    replacement: '-',  // replace spaces with replacement
    remove: undefined, // regex to remove characters
    lower: true,       // result in lower case
    strict: true,      // strip special characters except replacement
  });

  return `---
title: ${title}
permalink: ${slug}/
date: ${date}
author: ${author}
categories:
${categories.map((category) => `  - ${category}`).join('\n')}
---
`;
};

(async() => {
  await convertToMarkdown(pageId);
  const [date, title, categories, author] = await retrievePageProperties(pageId);
  const frontMatter = createFrontMatter(date, title, categories, author);
  const mdFile = fs.readFileSync(`./output/${pageId}.md`, 'utf8');
  fs.writeFileSync(`./output/${pageId}.md`, frontMatter + mdFile);
})();
