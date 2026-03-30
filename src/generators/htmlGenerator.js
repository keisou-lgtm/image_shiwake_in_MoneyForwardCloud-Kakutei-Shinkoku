'use strict';

/**
 * Generate a self-contained HTML preview using D3.js tree layout (right-expanding).
 * @param {object} rootNode - Tree node from parser
 * @param {string} title - Page title
 * @returns {string} Full HTML string
 */
function generateHtml(rootNode, title = 'Mind Map Preview') {
  const treeData = JSON.stringify(rootNode);

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <script src="https://d3js.org/d3.v7.min.js"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', 'Hiragino Sans', sans-serif;
      background: #1a1a2e;
      color: #eee;
      overflow: hidden;
      height: 100vh;
    }
    #toolbar {
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 10;
      display: flex;
      gap: 8px;
      align-items: center;
    }
    #toolbar button {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 13px;
      transition: background 0.2s;
    }
    #toolbar button:hover { background: rgba(255,255,255,0.2); }
    #title-label {
      font-size: 15px;
      font-weight: 600;
      color: rgba(255,255,255,0.7);
      margin-left: 8px;
    }
    svg { width: 100vw; height: 100vh; }
    .link {
      fill: none;
      stroke: rgba(255,255,255,0.2);
      stroke-width: 1.5px;
    }
    .node circle {
      stroke-width: 2px;
    }
    .node text {
      font-size: 13px;
      fill: #fff;
      dominant-baseline: middle;
    }
    .node--root circle { r: 18px; }
    .node--root text { font-size: 15px; font-weight: bold; }
    .tooltip {
      position: fixed;
      background: rgba(0,0,0,0.8);
      color: #fff;
      padding: 6px 10px;
      border-radius: 6px;
      font-size: 12px;
      pointer-events: none;
      display: none;
      max-width: 300px;
      word-break: break-all;
      z-index: 100;
    }
  </style>
</head>
<body>
  <div id="toolbar">
    <button id="btn-fit">全体表示</button>
    <button id="btn-zoomin">＋</button>
    <button id="btn-zoomout">－</button>
    <span id="title-label">${escapeHtml(title)}</span>
  </div>
  <div class="tooltip" id="tooltip"></div>
  <svg id="svg">
    <g id="root-g"></g>
  </svg>

  <script>
    const treeData = ${treeData};

    const svg = d3.select('#svg');
    const g = d3.select('#root-g');
    const tooltip = document.getElementById('tooltip');

    const zoom = d3.zoom()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
      });

    svg.call(zoom);

    // Build D3 hierarchy
    const root = d3.hierarchy(treeData, d => d.children && d.children.length ? d.children : null);

    // Tree layout — right expanding
    const nodeHeight = 48;
    const nodeWidth = 220;
    const treeLayout = d3.tree().nodeSize([nodeHeight, nodeWidth]);
    treeLayout(root);

    // Swap x/y so tree grows to the right
    root.each(d => {
      const tmp = d.x;
      d.x = d.y;
      d.y = tmp;
    });

    // Draw links
    g.selectAll('.link')
      .data(root.links())
      .enter()
      .append('path')
      .attr('class', 'link')
      .attr('d', d3.linkHorizontal()
        .x(d => d.x)
        .y(d => d.y)
      );

    // Draw nodes
    const node = g.selectAll('.node')
      .data(root.descendants())
      .enter()
      .append('g')
      .attr('class', d => 'node' + (d.depth === 0 ? ' node--root' : ''))
      .attr('transform', d => \`translate(\${d.x},\${d.y})\`)
      .on('mouseover', (event, d) => {
        tooltip.style.display = 'block';
        tooltip.textContent = d.data.title;
      })
      .on('mousemove', (event) => {
        tooltip.style.left = (event.clientX + 12) + 'px';
        tooltip.style.top = (event.clientY - 8) + 'px';
      })
      .on('mouseout', () => {
        tooltip.style.display = 'none';
      });

    // Node circles
    node.append('circle')
      .attr('r', d => d.depth === 0 ? 18 : d.depth === 1 ? 10 : 6)
      .style('fill', d => d.data.color || (d.depth === 0 ? '#ffffff' : '#555'))
      .style('stroke', d => d.data.color || '#fff')
      .style('opacity', d => d.depth === 0 ? 1 : 0.85);

    // Node labels
    node.append('text')
      .attr('dx', d => d.depth === 0 ? 24 : (d.depth === 1 ? 16 : 12))
      .attr('dy', 0)
      .style('fill', d => d.depth === 0 ? '#fff' : (d.data.color || '#eee'))
      .style('font-weight', d => d.depth <= 1 ? '600' : '400')
      .style('font-size', d => d.depth === 0 ? '15px' : d.depth === 1 ? '13px' : '12px')
      .text(d => d.data.title.length > 40 ? d.data.title.slice(0, 38) + '…' : d.data.title);

    // Initial fit
    function fitView() {
      const bounds = g.node().getBBox();
      const svgW = window.innerWidth;
      const svgH = window.innerHeight;
      const scale = Math.min(0.9, Math.min(svgW / (bounds.width + 80), svgH / (bounds.height + 80)));
      const tx = svgW / 2 - (bounds.x + bounds.width / 2) * scale;
      const ty = svgH / 2 - (bounds.y + bounds.height / 2) * scale;
      svg.call(zoom.transform, d3.zoomIdentity.translate(tx, ty).scale(scale));
    }

    setTimeout(fitView, 100);

    document.getElementById('btn-fit').addEventListener('click', fitView);
    document.getElementById('btn-zoomin').addEventListener('click', () => {
      svg.transition().call(zoom.scaleBy, 1.4);
    });
    document.getElementById('btn-zoomout').addEventListener('click', () => {
      svg.transition().call(zoom.scaleBy, 1 / 1.4);
    });
  </script>
</body>
</html>`;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

module.exports = { generateHtml };
