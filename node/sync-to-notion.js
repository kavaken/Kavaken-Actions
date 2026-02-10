const fs = require("fs");
const path = require("path");
const { Client } = require("@notionhq/client");
const { markdownToBlocks } = require("@tryfabric/martian");

const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
const parentPageId = process.env.NOTION_WORKFLOW_PAGE_ID;
function getTitle(markdown) {
  const match = markdown.match(/^#\s+(.+)$/m);
  if (match) return match[1].trim();

  // Fallback to repo name if no H1 found
  return process.env.GITHUB_REPOSITORY.split("/")
    .pop()
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

async function findChildPage(parentId, title) {
  const { results } = await notion.blocks.children.list({
    block_id: parentId,
    page_size: 100,
  });

  for (const block of results) {
    if (block.type === "child_page" && block.child_page.title === title) {
      return block.id;
    }
  }

  return null;
}

async function createChildPage(parentId, title) {
  const page = await notion.pages.create({
    parent: { page_id: parentId },
    properties: {
      title: [{ text: { content: title } }],
    },
  });

  return page.id;
}

async function clearPage(pageId) {
  const { results } = await notion.blocks.children.list({
    block_id: pageId,
    page_size: 100,
  });

  for (const block of results) {
    await notion.blocks.delete({ block_id: block.id });
  }
}

async function appendBlocks(pageId, blocks) {
  // Notion API limits to 100 blocks per request
  for (let i = 0; i < blocks.length; i += 100) {
    const chunk = blocks.slice(i, i + 100);
    await notion.blocks.children.append({
      block_id: pageId,
      children: chunk,
    });
  }
}

async function main() {
  // Find all *_PIPELINE.md files in the repo
  const repoRoot = process.cwd();
  const files = fs
    .readdirSync(repoRoot)
    .filter((f) => f.endsWith("_WORKFLOW.md"));

  if (files.length === 0) {
    console.log("No *_WORKFLOW.md files found.");
    return;
  }

  // Concatenate all pipeline docs with a separator
  let combined = "";
  for (const file of files) {
    const content = fs.readFileSync(path.join(repoRoot, file), "utf-8");
    if (combined) combined += "\n\n---\n\n";
    combined += content;
  }

  console.log(`Found ${files.length} pipeline doc(s): ${files.join(", ")}`);

  // Extract title from markdown H1, or fall back to repo name
  const title = getTitle(combined);

  // Find or create a sub-page named after this repo
  let childPageId = await findChildPage(parentPageId, title);

  if (childPageId) {
    console.log(`Found existing sub-page for "${title}", updating...`);
    await clearPage(childPageId);
  } else {
    console.log(`Creating new sub-page for "${title}"...`);
    childPageId = await createChildPage(parentPageId, title);
  }

  // Convert markdown to Notion blocks and write
  const blocks = markdownToBlocks(combined);

  console.log(`Writing ${blocks.length} blocks to Notion...`);
  await appendBlocks(childPageId, blocks);

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
