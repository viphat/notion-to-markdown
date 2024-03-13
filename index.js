require('dotenv').config()

const { Client } = require("@notionhq/client");
const { NotionToMarkdown } = require("notion-to-md");
const slugify = require('slugify');

const https = require('https');
const fs = require('fs');
const path = require('path');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const n2m = new NotionToMarkdown({ notionClient: notion });

const databaseId = process.env.NOTION_DATABASE_ID;
const datePropertyId = process.env.NOTION_DATE_PROPERTY_ID;
const titlePropertyId = process.env.NOTION_TITLE_PROPERTY_ID;
const categoriesPropertyId = process.env.NOTION_CATEGORIES_PROPERTY_ID;
const authorPropertyId = process.env.NOTION_AUTHOR_PROPERTY_ID;

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

const generateUniqueFilename = (originalPath) => {
  let basePath = path.dirname(originalPath);
  let extension = path.extname(originalPath);
  let name = path.basename(originalPath, extension);
  let counter = 1;

  // Generate new path with counter until the file does not exist
  let newPath = originalPath;
  while (fs.existsSync(newPath)) {
    newPath = path.join(basePath, `${name}_${counter}${extension}`);
    counter++;
  }

  return newPath;
}

const downloadImage = (url, dest) => new Promise((resolve, reject) => {
  https.get(url, (response) => {
    const chunks = [];
    response.on('data', (chunk) => chunks.push(chunk));
    response.on('end', async () => { // Make sure this callback is async
      const buffer = Buffer.concat(chunks);
      let finalDest = dest;

      if (path.extname(dest) === '') {
        try {
          const fileType = await import('file-type');
          const type = await fileType.fileTypeFromBuffer(buffer); // Adjusted for named export or direct function call
          const extension = type ? type.ext : '';
          finalDest += extension ? '.' + extension : '';
          finalDest = generateUniqueFilename(finalDest);
          fs.writeFileSync(finalDest, buffer);
          resolve(finalDest);
        } catch (error) {
          console.error('Error processing file type', error);
          reject(error);
        }
      } else {
        finalDest = generateUniqueFilename(finalDest);
        fs.writeFileSync(finalDest, buffer);
        resolve(finalDest);
      }
    });
  }).on('error', (error) => {
    fs.unlink(dest, () => {});
    reject(error);
  });
});

const retrieveThenReplaceAllImages = async (pageId) => {
  const imageUrls = [];

  const filePath = `./output/${pageId}.md`;
  let content = fs.readFileSync(filePath, 'utf8');
  const regex = /!\[.*\]\((.*)\)/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    imageUrls.push(match[1]);
  }

  const imageDir = `./output/images/${pageId}/`;
  fs.mkdirSync(imageDir, { recursive: true });

  for (const url of imageUrls) {
    let filename = path.basename(url);
    filename = filename.split('?')[0];
    const finalDest = await downloadImage(url, path.join(imageDir, filename));
    filename = path.basename(finalDest);

    content = content.replace(url, `/images/${pageId}/${filename}`);
  }

  // Write the modified content back to the file
  fs.writeFileSync(filePath, content);

  return imageUrls;
}

const getPages = async (databaseId) => {
  const pages = [];
  let cursor = undefined;

  while (true) {
    const response = await notion.databases.query({
      database_id: databaseId,
      start_cursor: cursor
    });

    pages.push(...response.results);

    if (!response.has_more) {
      break;
    }

    cursor = response.next_cursor;
  }

  return pages;
}

const convertAllToMarkdown = async (pages) => {
  for (const page of pages) {
    const pageId = page.id;
    const filePath = `./output/${pageId}.md`;
    if (fs.existsSync(filePath)) {
      console.log(`Skipping ${pageId} as it has already been processed`);
      continue;
    }

    console.log(`Processing ${pageId}`);
    // print page title to console
    console.log(page.properties['Tiêu đề'].title[0].plain_text);
    const [date, title, categories, author] = await retrievePageProperties(pageId);
    await convertToMarkdown(pageId);
    const frontMatter = createFrontMatter(date, title, categories, author);
    const mdFile = fs.readFileSync(`./output/${pageId}.md`, 'utf8');
    fs.writeFileSync(`./output/${pageId}.md`, frontMatter + mdFile);
    await retrieveThenReplaceAllImages(pageId);
  }
}

const main = async () => {
  const pages = await getPages(databaseId);
  await convertAllToMarkdown(pages);
}

// Get the page ID from the command line arguments
const pageId = process.argv[2];
if (pageId) {
  // Process a single page
  (async () => {
    await convertToMarkdown(pageId);
    const [date, title, categories, author] = await retrievePageProperties(pageId);
    const frontMatter = createFrontMatter(date, title, categories, author);
    const mdFile = fs.readFileSync(`./output/${pageId}.md`, 'utf8');
    fs.writeFileSync(`./output/${pageId}.md`, frontMatter + mdFile);
    retrieveThenReplaceAllImages(pageId);
  })();
} else {
  // Process all pages in the database
  main();
}

