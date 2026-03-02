import test from "node:test";
import assert from "node:assert/strict";
import { extractFeedsFromOpml } from "../src/opml.js";

test("extractFeedsFromOpml parses nested outlines", () => {
  const xml = `<?xml version="1.0"?>
<opml version="2.0">
  <body>
    <outline text="Tech">
      <outline text="Feed A" xmlUrl="https://example.com/a.xml" />
      <outline text="Subgroup">
        <outline title="Feed B" xmlUrl="https://example.com/b.xml" />
      </outline>
    </outline>
  </body>
</opml>`;

  const feeds = extractFeedsFromOpml(xml);
  assert.equal(feeds.length, 2);
  assert.equal(feeds[0]?.url, "https://example.com/a.xml");
  assert.equal(feeds[1]?.url, "https://example.com/b.xml");
});
