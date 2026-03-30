'use strict';

const JSZip = require('jszip');
const { v4: uuidv4 } = require('uuid');

const STRUCTURE_CLASS = 'org.xmind.ui.logic.right';

/**
 * Convert a tree node (from parser) into an XMind topic object recursively.
 */
function nodeToTopic(node) {
  const topic = {
    id: node.id || uuidv4(),
    title: node.title,
    structureClass: STRUCTURE_CLASS,
  };

  if (node.color) {
    topic.style = {
      properties: {
        fillColor: node.color,
        lineColor: node.color,
      },
    };
  }

  if (node.children && node.children.length > 0) {
    topic.children = {
      attached: node.children.map(child => nodeToTopic(child)),
    };
  }

  return topic;
}

/**
 * Generate .xmind file as a Buffer from a tree node.
 * Returns a Promise<Buffer>.
 */
async function generateXmind(rootNode) {
  const sheetId = uuidv4();
  const rootTopic = nodeToTopic(rootNode);

  const contentJson = [
    {
      id: sheetId,
      class: 'sheet',
      title: 'Sheet 1',
      rootTopic,
      extensions: [
        {
          provider: 'org.xmind.ui.map.unbalanced',
          content: [
            {
              name: 'right-and-left',
              content: 'right',
            },
          ],
        },
      ],
    },
  ];

  const metadataJson = {
    creator: {
      name: 'xmind-converter',
      version: '1.0',
    },
  };

  const zip = new JSZip();
  zip.file('content.json', JSON.stringify(contentJson, null, 2));
  zip.file('metadata.json', JSON.stringify(metadataJson, null, 2));

  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  return buffer;
}

module.exports = { generateXmind };
