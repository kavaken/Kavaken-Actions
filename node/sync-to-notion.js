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

  function getRepoName() {
    return (process.env.GITHUB_REPOSITORY || "")
      .split("/")
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

  async function findOrCreatePage(parentId, title) {
    let pageId = await findChildPage(parentId, title);

    if (!pageId) {
      console.log(`  Creating "${title}"...`);
      pageId = await createChildPage(parentId, title);
    }

    return pageId;
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

  async function main() {
    const changedFiles = (process.env.CHANGED_FILES || "")
      .split(",")
      .map((f) => f.trim())
      .filter((f) => f.endsWith("_WORKFLOW.md"));

    if (changedFiles.length === 0) {
      console.log("No changed workflow docs to sync.");
      return;
    }

    // Find or create the repo folder page
    const repoName = getRepoName();
    console.log(`Repo folder: "${repoName}"`);
    const repoPageId = await findOrCreatePage(parentPageId, repoName);

    // Sync each changed file as a sub-page under the repo folder
    for (const file of changedFiles) {
      const filePath = path.resolve(process.cwd(), file);
      const content = fs.readFileSync(filePath, "utf-8");
      const title = getTitle(content);

      if (!title) {
        console.log(`Skipping ${file} — no H1 title found.`);
        continue;
      }

      console.log(`Syncing "${title}"...`);

      let docPageId = await findChildPage(repoPageId, title);

      if (docPageId) {
        console.log(`  Found existing page, updating...`);
        await clearPage(docPageId);
      } else {
        console.log(`  Creating new page...`);
        docPageId = await createChildPage(repoPageId, title);
      }

      const blocks = markdownToBlocks(content);
      console.log(`  Writing ${blocks.length} blocks...`);
      await appendBlocks(docPageId, blocks);
    }

    console.log("Done.");
  }

  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });