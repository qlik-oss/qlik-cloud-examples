import 'dotenv/config';
import { auth, qix } from "@qlik/api";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const hostConfig = {
    authType: "oauth2",
    host: process.env.QLIK_HOST,
    clientId: process.env.QLIK_CLIENT_ID,
    clientSecret: process.env.QLIK_CLIENT_SECRET,
};

auth.setDefaultHostConfig(hostConfig);

// Open the app and create an engine session
const appId = process.env.QLIK_APP_ID;
const session = qix.openAppSession({ appId, withoutData: true });
const app = await session.getDoc();

// Check if we should save layouts to disk (default: false)
const saveLayouts = process.env.SAVE_LAYOUTS === 'true';
let layoutsDir;

if (saveLayouts) {
  // Create layouts directory specific to the app
  layoutsDir = path.join(__dirname, 'layouts', appId);
  
  // Clear the directory if it exists, then create it fresh
  if (fs.existsSync(layoutsDir)) {
    fs.rmSync(layoutsDir, { recursive: true, force: true });
  }
  fs.mkdirSync(layoutsDir, { recursive: true });
  
  console.log('Saving layouts to:', layoutsDir);
  console.log('');
}

// Track visited objects to prevent infinite loops
const visitedObjects = new Set();

// Recursive function to get child objects at unlimited depth
async function getChildObjects(objectId, indent = '  ', visitedSet = visitedObjects) {
  // Skip if we've already processed this object (prevent circular references)
  if (visitedSet.has(objectId)) {
    return 0;
  }
  
  // Mark as visited
  visitedSet.add(objectId);
  
  try {
    const childObject = await app.getObject(objectId);
    const childProperties = await childObject.getProperties();
    const layout = await childObject.getLayout();
    
    // Save layout to disk if enabled
    if (saveLayouts) {
      const sanitizedObjectId = objectId.replace(/[^a-zA-Z0-9-]/g, '_');
      const layoutFilePath = path.join(layoutsDir, `${sanitizedObjectId}.json`);
      fs.writeFileSync(layoutFilePath, JSON.stringify(layout, null, 2), 'utf8');
    }
    
    // Extract title from layout - prefer title, fallback to qMeta.title for objects such as master items
    const title = layout.title || layout.qMeta?.title || 'Untitled';
    
    // Get type from layout (what's actually being rendered)
    const type = layout.visualization;
    
    // Check if this is a master item instance (not compound context objects)
    // Note: We use childProperties.qExtendsId because it's in properties, not layout
    const isMasterItem = childProperties.qExtendsId && !objectId.includes('qlik-compound-context');
    const masterItemId = childProperties.qExtendsId || null;
    
    console.log(`${indent}Object ID: ${objectId}`);
    console.log(`${indent}  Object Name: ${title}`);
    console.log(`${indent}  Object Type: ${type}`);
    if (isMasterItem && masterItemId) {
      console.log(`${indent}  Master Item ID: ${masterItemId}`);
    }
    
    let childCount = 0;
    const childIds = new Set();
    
    // Collect child IDs from properties (container cells)
    if (childProperties.cells && childProperties.cells.length > 0) {
      for (const cell of childProperties.cells) {
        if (cell.name) {
          childIds.add(cell.name);
        }
      }
    }
    
    // Check for children in qChildList from layout
    if (layout.qChildList && layout.qChildList.qItems && layout.qChildList.qItems.length > 0) {
      for (const layoutChild of layout.qChildList.qItems) {
        if (layoutChild.qInfo && layoutChild.qInfo.qId) {
          childIds.add(layoutChild.qInfo.qId);
        }
      }
    }
    
    // Process all child objects recursively
    if (childIds.size > 0) {
      console.log(`${indent}  └─ Has ${childIds.size} child object(s):`);
      for (const childId of childIds) {
        childCount += await getChildObjects(childId, indent + '     ', visitedSet);
      }
    }
    
    return 1 + childCount;
  } catch (error) {
    // Object might not be accessible, skip it
    return 0;
  }
}

// Get the sheets in the app
const sheetList = await app.getSheetList();

let totalSheets = 0;
let totalObjects = 0;

for (const sheet of sheetList) {
  totalSheets++;
  console.log(`\nSheet: ${sheet.qMeta.title}`);
  
  // Get the sheet object to access its properties and children
  const sheetObject = await app.getObject(sheet.qInfo.qId);
  const sheetProperties = await sheetObject.getProperties();
  
  // The children are in the cells property
  const children = sheetProperties.cells || [];
  
  console.log(`└─ Sheet has ${children.length} object(s):`);
  
  for (const child of children) {
    if (child.name) {
      const objectCount = await getChildObjects(child.name);
      totalObjects += objectCount;
    }
  }
}

// Print summary stats
console.log('\n' + '='.repeat(50));
console.log('Summary:');
console.log(`  Total Sheets: ${totalSheets}`);
console.log(`  Total Objects: ${totalObjects}`);
console.log('='.repeat(50));

// Close the session and exit
await session.close();
process.exit(0);