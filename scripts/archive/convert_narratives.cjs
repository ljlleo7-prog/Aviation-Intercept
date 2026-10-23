
const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'src/data/narrativeDatabase.json');
const db = require(dbPath);

const enNarratives = {};
const zhNarratives = {};

function processNode(node, pathPrefix) {
  if (Array.isArray(node)) {
    return node.map((item, index) => processNode(item, `${pathPrefix}.${index}`));
  } else if (typeof node === 'object' && node !== null) {
    const newNode = {};
    // Check if this is a narrative node (has title and content)
    if (node.title && node.content) {
       const titleKey = `${pathPrefix}.title`;
       const contentKey = `${pathPrefix}.content`;
       
       // Add to English map
       // Convert ${var} to {var} for i18next
       enNarratives[titleKey] = node.title.replace(/\${(\w+)}/g, '{$1}');
       enNarratives[contentKey] = node.content.replace(/\${(\w+)}/g, '{$1}');
       
       // Mock Chinese translation (just append [ZH] for now, I'll refine later)
       zhNarratives[titleKey] = node.title.replace(/\${(\w+)}/g, '{$1}') + " [ZH]";
       zhNarratives[contentKey] = node.content.replace(/\${(\w+)}/g, '{$1}') + " [ZH]";

       newNode.title = titleKey;
       newNode.content = contentKey;
       
       // Copy other properties
       for (const key in node) {
         if (key !== 'title' && key !== 'content') {
           newNode[key] = node[key];
         }
       }
       return newNode;
    } else {
      // Recurse
      for (const key in node) {
        newNode[key] = processNode(node[key], `${pathPrefix}.${key}`);
      }
      return newNode;
    }
  }
  return node;
}

const newDb = processNode(db, 'narrative');

// Write new DB
fs.writeFileSync(dbPath, JSON.stringify(newDb, null, 2));

// Generate locale snippets
console.log('--- EN Snippet ---');
console.log(JSON.stringify(enNarratives, null, 2));

console.log('--- ZH Snippet ---');
console.log(JSON.stringify(zhNarratives, null, 2));
