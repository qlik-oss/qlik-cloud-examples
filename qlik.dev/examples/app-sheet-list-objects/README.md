# App Sheet List Objects Example

This example demonstrates how to recursively enumerate all sheets and objects in a Qlik Sense app in Qlik Cloud, including nested objects within containers. It uses the Qlik Engine API via WebSocket (handled by the @qlik/api typescript package) to retrieve object layouts and properties.

## What This App Does

The script connects to a Qlik Sense app in Qlik Cloud and:

1. **Lists all sheets** in the app
2. **Enumerates all objects** on each sheet (charts, tables, filters, etc.)
3. **Recursively explores containers** to find nested child objects at unlimited depth
4. **Displays object details** including:
   - Object ID
   - Object Name (title)
   - Object Type (visualization type)
   - Master Item ID (if the object is based on a master item)
5. **Optionally saves layouts** - When enabled, saves all object layouts as JSON files organized by app ID
6. **Provides summary statistics** - Shows total count of sheets and objects found

The script handles:

- Circular reference prevention (using visited object tracking)
- Master item instances vs. compound context objects
- Nested containers (e.g., tabbed containers, layout containers)
- Objects with and without titles

## Prerequisites

- Node.js installed
- A Qlik Cloud tenant
- A machine-to-machine OAuth client configured in Qlik Cloud

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Create a `.env` file based on the `.env.example` file:
   ```bash
   cp .env.example .env
   ```

3. Edit the `.env` file and add your credentials:
   ```
   QLIK_HOST=your-tenant.region.qlikcloud.com
   QLIK_CLIENT_ID=your_client_id_here
   QLIK_CLIENT_SECRET=your_client_secret_here
   QLIK_APP_ID=your_app_id
   SAVE_LAYOUTS=false
   ```

## Running the Example

```bash
npm start
```

Or directly with Node.js:

```bash
node index.js
```

### Example Output

```
Sheet: Dashboard
└─ Sheet has 3 object(s):
  - Object ID: abc123
    Name: Sales Overview
    Type: barchart
    Master Item ID: master-123
  - Object ID: def456
    Name: KPI Panel
    Type: sn-layout-container
    └─ Has 2 child object(s):
       - Object ID: ghi789
         Name: Total Sales
         Type: kpi
       - Object ID: jkl012
         Name: Total Orders
         Type: kpi

==================================================
Summary:
  Total Sheets: 1
  Total Objects: 5
==================================================

==================================================
Master Item Usage:
==================================================

Master Item ID: master-123
  Used 1 time(s):
  └─ Sheet: "Dashboard" (sheet1)
     1 instance(s)
       - abc123: "Sales Overview"

==================================================
Visualization Type Distribution:
==================================================
  kpi: 2
  barchart: 1
  sn-layout-container: 1
==================================================
```

## Configuration

The example uses environment variables for configuration:

- `QLIK_HOST`: Your Qlik Cloud tenant URL (without https://)
- `QLIK_CLIENT_ID`: OAuth Client ID
- `QLIK_CLIENT_SECRET`: OAuth Client Secret
- `QLIK_APP_ID`: The ID of the Qlik Sense app to connect to
- `SAVE_LAYOUTS`: Optional. Set to `true` to save object layouts as JSON files (default: `false`)

These are loaded from the `.env` file using the `dotenv` package.

### Saving Layouts

When `SAVE_LAYOUTS=true`, the script will:
- Create a `layouts/<app-id>/` directory
- Clear any existing files in that directory
- Save each sheet's layout as a JSON file named `sheet-layout_<sheet-id>.json`
- Save each sheet's properties as a JSON file named `sheet-properties_<sheet-id>.json`
- Save each object's layout as a JSON file named `viz_<object-id>.json`
- Generate an `object-library.json` file with a complete inventory and analysis
- The layout and properties files contain full object/sheet metadata, properties, and child object information

This is useful for:

- Debugging object structures
- Understanding object relationships
- Analyzing app composition
- Exporting object configurations
- Tracking master item usage across sheets
- Analyzing visualization type distribution

### Object Library

The `object-library.json` file contains a comprehensive analysis of your app:

**Sheets**: List of all sheets with IDs, titles, and object counts

**Objects**: Complete inventory of all objects with:
- ID, title, type
- Master item status and ID
- Associated sheet ID

**Master Item Usage**: Detailed tracking showing:
- Each master item ID
- Total usage count
- Every sheet where it's used
- Object instances with IDs and titles

**Visualization Types**: Distribution of visualization types across the app

**Summary Statistics**: Quick overview including:
- Total sheets and objects
- Unique visualization types
- Number of master items used

Example structure:
```json
{
  "sheets": [...],
  "objects": [...],
  "masterItemUsage": [
    {
      "masterItemId": "abc-123",
      "usageCount": 5,
      "usages": [
        {
          "sheetId": "sheet1",
          "sheetTitle": "Dashboard",
          "objectId": "obj1",
          "objectTitle": "Sales Chart"
        }
      ]
    }
  ],
  "visualizationTypes": [...],
  "summary": {...}
}
```

## Why OAuth instead of API Key?

This example uses OAuth authentication because it requires a WebSocket connection to the Qlik engine. API keys require a web integration to be configured for WebSocket connections, while OAuth provides direct access without additional configuration.
