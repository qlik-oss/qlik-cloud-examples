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

// Object library inventory
const inventory = {
  sheets: [],
  objects: [],
  masterItemUsage: new Map(),
  visualizationTypes: new Map(),
};

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
async function getChildObjects(objectId, indent = '     ', visitedSet = visitedObjects, depth = 0, currentSheetId = null, currentSheetTitle = null) {
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
      const layoutFilePath = path.join(layoutsDir, `viz_${sanitizedObjectId}.json`);
      fs.writeFileSync(layoutFilePath, JSON.stringify(layout, null, 2), 'utf8');
    }
    
    // Extract title from layout - prefer title, fallback to qMeta.title for objects such as master items
    const title = layout.title || layout.qMeta?.title || 'Untitled';
    
    // Get type from layout (what's actually being rendered)
    const type = layout.visualization;
    
    // Track visualization types
    if (type) {
      inventory.visualizationTypes.set(
        type,
        (inventory.visualizationTypes.get(type) || 0) + 1
      );
    }
    
    // Check if this is a master item instance (not compound context objects)
    // Note: We use childProperties.qExtendsId because it's in properties, not layout
    const isMasterItem = childProperties.qExtendsId && !objectId.includes('qlik-compound-context');
    const masterItemId = childProperties.qExtendsId || null;
    
    // Track master item usage
    if (isMasterItem && masterItemId && currentSheetId) {
      if (!inventory.masterItemUsage.has(masterItemId)) {
        inventory.masterItemUsage.set(masterItemId, []);
      }
      inventory.masterItemUsage.get(masterItemId).push({
        sheetId: currentSheetId,
        sheetTitle: currentSheetTitle,
        objectId: objectId,
        objectTitle: title
      });
    }
    
    // Add to objects inventory
    inventory.objects.push({
      id: objectId,
      title,
      type,
      isMasterItem,
      masterItemId,
      depth,
      sheetId: currentSheetId
    });
    
    console.log(`${indent}- Object ID: ${objectId}`);
    console.log(`${indent}  Name: ${title}`);
    console.log(`${indent}  Type: ${type}`);
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
        childCount += await getChildObjects(childId, indent + '     ', visitedSet, depth + 1, currentSheetId, currentSheetTitle);
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
  
  // Save sheet layout and properties if enabled
  if (saveLayouts) {
    const sheetLayout = await sheetObject.getLayout();
    const sanitizedSheetId = sheet.qInfo.qId.replace(/[^a-zA-Z0-9-]/g, '_');
    
    const sheetLayoutFilePath = path.join(layoutsDir, `sheet-layout_${sanitizedSheetId}.json`);
    fs.writeFileSync(sheetLayoutFilePath, JSON.stringify(sheetLayout, null, 2), 'utf8');
    
    const sheetPropertiesFilePath = path.join(layoutsDir, `sheet-properties_${sanitizedSheetId}.json`);
    fs.writeFileSync(sheetPropertiesFilePath, JSON.stringify(sheetProperties, null, 2), 'utf8');
  }
  
  // The children are in the cells property
  const children = sheetProperties.cells || [];
  
  // Add sheet to inventory
  inventory.sheets.push({
    id: sheet.qInfo.qId,
    title: sheet.qMeta.title,
    objectCount: children.length
  });
  
  console.log(`└─ Sheet has ${children.length} object(s):`);
  
  for (const child of children) {
    if (child.name) {
      const objectCount = await getChildObjects(child.name, '  ', visitedObjects, 0, sheet.qInfo.qId, sheet.qMeta.title);
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

// Print master item usage
if (inventory.masterItemUsage.size > 0) {
  console.log('\n' + '='.repeat(50));
  console.log('Master Item Usage:');
  console.log('='.repeat(50));
  
  for (const [masterItemId, usages] of inventory.masterItemUsage) {
    console.log(`\nMaster Item ID: ${masterItemId}`);
    console.log(`  Used ${usages.length} time(s):`);
    
    // Group by sheet
    const bySheet = new Map();
    for (const usage of usages) {
      if (!bySheet.has(usage.sheetId)) {
        bySheet.set(usage.sheetId, {
          sheetTitle: usage.sheetTitle,
          objects: []
        });
      }
      bySheet.get(usage.sheetId).objects.push({
        objectId: usage.objectId,
        objectTitle: usage.objectTitle
      });
    }
    
    for (const [sheetId, data] of bySheet) {
      console.log(`  └─ Sheet: "${data.sheetTitle}" (${sheetId})`);
      console.log(`     ${data.objects.length} instance(s)`);
      for (const obj of data.objects) {
        console.log(`       - ${obj.objectId}: "${obj.objectTitle}"`);
      }
    }
  }
}

// Print visualization type distribution
if (inventory.visualizationTypes.size > 0) {
  console.log('\n' + '='.repeat(50));
  console.log('Visualization Type Distribution:');
  console.log('='.repeat(50));
  
  const sortedTypes = Array.from(inventory.visualizationTypes.entries())
    .sort((a, b) => b[1] - a[1]);
  
  for (const [type, count] of sortedTypes) {
    console.log(`  ${type}: ${count}`);
  }
}

// Save inventory to disk if enabled
if (saveLayouts) {
  const inventoryFilePath = path.join(layoutsDir, 'object-library.json');
  
  // Convert Maps to objects for JSON serialization
  const inventoryForJson = {
    sheets: inventory.sheets,
    objects: inventory.objects,
    masterItemUsage: Array.from(inventory.masterItemUsage.entries()).map(([id, usages]) => ({
      masterItemId: id,
      usageCount: usages.length,
      usages
    })),
    visualizationTypes: Array.from(inventory.visualizationTypes.entries()).map(([type, count]) => ({
      type,
      count
    })).sort((a, b) => b.count - a.count),
    summary: {
      totalSheets: totalSheets,
      totalObjects: totalObjects,
      uniqueVisualizationTypes: inventory.visualizationTypes.size,
      masterItemsUsed: inventory.masterItemUsage.size
    }
  };
  
  fs.writeFileSync(inventoryFilePath, JSON.stringify(inventoryForJson, null, 2), 'utf8');
}

// Close the session and exit
await session.close();
process.exit(0);