'use strict';

const { marked } = require('marked');
const { v4: uuidv4 } = require('uuid');

const COLOR_PALETTE = [
  '#EF5350', '#AB47BC', '#42A5F5', '#26A69A',
  '#66BB6A', '#FFA726', '#EC407A', '#7E57C2'
];

/**
 * Build a tree node
 */
function makeNode(title, level, color = null) {
  return { id: uuidv4(), title, level, color, children: [] };
}

/**
 * Parse Markdown text into a tree structure.
 * # → root (level 0), ## → level 1, ### → level 2, ...
 */
function parseMarkdown(markdownText) {
  const tokens = marked.lexer(markdownText);
  const headings = tokens.filter(t => t.type === 'heading');

  if (headings.length === 0) {
    return makeNode('Mind Map', 0);
  }

  // Use first heading as root, or synthesize one
  let rootNode = null;
  const stack = []; // [{node, level}]
  let colorIndex = 0;

  for (const token of headings) {
    const depth = token.depth; // 1-6
    const level = depth - 1;  // 0=root, 1=first branch, ...
    const title = token.text.replace(/\*\*/g, '').replace(/`/g, '').trim();

    const node = makeNode(title, level);

    if (level === 0) {
      // Root node
      rootNode = node;
      stack.length = 0;
      stack.push({ node, level: 0 });
    } else {
      // Assign color for level-1 nodes
      if (level === 1) {
        node.color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
        colorIndex++;
      }

      // Find parent: pop stack until we find a node with smaller level
      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].node;

      // Inherit color from parent if not level-1
      if (level > 1) {
        node.color = parent.color;
      }

      parent.children.push(node);
      stack.push({ node, level });
    }
  }

  // If no h1 found, create a synthetic root
  if (!rootNode) {
    rootNode = makeNode('Mind Map', 0);
    // Attach all top-level items to root
    for (const item of stack) {
      if (item.level === 1) {
        rootNode.children.push(item.node);
      }
    }
  }

  return rootNode;
}

/**
 * Shared helper: build tree from a list of {depth, text} items.
 * Used by both markdown and Google Docs parsers.
 */
function buildTreeFromHeadings(headingList) {
  if (headingList.length === 0) {
    return makeNode('Mind Map', 0);
  }

  let rootNode = null;
  const stack = [];
  let colorIndex = 0;

  for (const { depth, text } of headingList) {
    const level = depth - 1;
    const node = makeNode(text, level);

    if (level === 0) {
      rootNode = node;
      stack.length = 0;
      stack.push({ node, level: 0 });
    } else {
      if (level === 1) {
        node.color = COLOR_PALETTE[colorIndex % COLOR_PALETTE.length];
        colorIndex++;
      }

      while (stack.length > 1 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const parent = stack[stack.length - 1].node;

      if (level > 1) {
        node.color = parent.color;
      }

      parent.children.push(node);
      stack.push({ node, level });
    }
  }

  if (!rootNode && stack.length > 0) {
    rootNode = makeNode('Mind Map', 0);
    for (const item of stack) {
      if (item.node !== rootNode) {
        rootNode.children.push(item.node);
      }
    }
  }

  return rootNode || makeNode('Mind Map', 0);
}

module.exports = { parseMarkdown, buildTreeFromHeadings, COLOR_PALETTE };
