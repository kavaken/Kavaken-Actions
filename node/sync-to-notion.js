  const fs = require("fs");                                                                                                                                                     
  const path = require("path");
  const { Client } = require("@notionhq/client");                                                                                                                               
  const { markdownToBlocks } = require("@tryfabric/martian");                                                                                                                 
                                                                                                                                                                              
  const notion = new Client({ auth: process.env.NOTION_API_TOKEN });
  const parentPageId = process.env.NOTION_WORKFLOW_PAGE_ID;

  function getTitle(markdown) {
    const match = markdown.match(/^#\s+(.+)$/m);
    if (match) return match[1].trim();
    return null;
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
    for (let i = 0; i < blocks.length; i += 100) {
      const chunk = blocks.slice(i, i + 100);
      await notion.blocks.children.append({
        block_id: pageId,
        children: chunk,
      });
    }
  }

  async function syncFile(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const title = getTitle(content);

    if (!title) {
      console.log(`Skipping ${filePath} — no H1 title found.`);
      return;
    }

    console.log(`Syncing "${title}"...`);

    let childPageId = await findChildPage(parentPageId, title);

    if (childPageId) {
      console.log(`  Found existing sub-page, updating...`);
      await clearPage(childPageId);
    } else {
      console.log(`  Creating new sub-page...`);
      childPageId = await createChildPage(parentPageId, title);
    }

    const blocks = markdownToBlocks(content);
    console.log(`  Writing ${blocks.length} blocks...`);
    await appendBlocks(childPageId, blocks);
  }

  async function main() {
    const changedFiles = (process.env.CHANGED_FILES || "")
      .split("\n")
      .map((f) => f.trim())
      .filter((f) => f.endsWith("_WORKFLOW.md"));

    if (changedFiles.length === 0) {
      console.log("No changed workflow docs to sync.");
      return;
    }

    console.log(`Syncing ${changedFiles.length} changed doc(s): ${changedFiles.join(", ")}`);

    for (const file of changedFiles) {
      const filePath = path.resolve(process.cwd(), file);
      await syncFile(filePath);
    }

    console.log("Done.");
  }

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });