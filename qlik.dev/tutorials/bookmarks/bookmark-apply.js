//bookmark-apply.js
//Apply a shared bookmark in an app and print out the selected values.
//Authorizes through OAuth2 M2M to connect to a Qlik Cloud application.
//To create an OAuth client for this snippet, go here:
//https://qlik.dev/authenticate/oauth/create-oauth-client
//To use a sample app with this snippet, download and import the executive
//dashboard from this github location https://github.com/qlik-oss/qlik-cloud-examples/raw/main/qlik.dev/sample-apps/qlik-dev-exec-dashboard.qvf
/*PARAMS
* host: the hostname of your tenant
* clientId: the clientId of the OAuth2 client you created
* clientSecret: the client secret for the OAuth2 client you created
* appId: The GUID for the Qlik Sense app
*/

//Uncomment below if you're using this code with https://repl.it
//global.fetch = require('@replit/node-fetch');

const Qlik = require('@qlik/sdk').default;
const { AuthType } = require("@qlik/sdk");

//config-values
const host = process.env['host'] // "<tenant.region.qlikcloud.com>";
const clientId = process.env['clientId'] // "<OAUTH_CLIENT_ID>";
const clientSecret = process.env['clientSecret'] //"<OAUTH_CLIENT_SECRET>";
const appId = process.env['appId'] // "<APPID_GUID_LIKE_THIS_b1b79fcd-e500-491c-b6e9-2ceaa109214c";

const config =  {
  authType: AuthType.OAuth2,
  host: host,
  clientId: clientId,
  clientSecret: clientSecret
};

(async () => {
  const qlik = new Qlik(config);
  await qlik.auth.authorize();
  const app = await qlik.apps.get(appId);
  await app.open();
  const bmk = await app.applyBookmark('SmDXrz');
  if(!bmk)
  {
    console.log("bookmark apply failed.");
    process.exit();
  }

  const sessObj = await app.createSessionObject({
      "qInfo": {
        "qType": "CurrentSelections"
      },
      "qSelectionObjectDef": {}
    }
  );
  const selectionLayout = await sessObj.getLayout();
  for (const item of selectionLayout.qSelectionObject.qSelections)
    {
    console.log(item.qField);
    console.log("==========");
    const myListObj = await getListObject(app, item.qSelectedCount, item.qField);
    const listLayout = await myListObj.getLayout();
    for (const pages of listLayout.qListObject.qDataPages)
      {
        for (const val of pages.qMatrix)
          {
            console.log(val[0].qText);
          }
      }
    console.log("==========");
    }
  process.exit();
})();

async function getListObject(app, valCount, fieldName)
{
  const listObj = await app.createSessionObject({
    "qInfo": {
        "qId": "LB01",
        "qType": "ListObject"
      },
      "qListObjectDef": {
        "qStateName": "$",
        "qLibraryId": "",
        "qDef": {
          "qFieldDefs": [
            fieldName
          ],
          "qFieldLabels": [
            fieldName
          ],
          "qSortCriterias": [
            {
              "qSortByLoadOrder": 1
            }
          ]
        },
        "qInitialDataFetch": [
          {
            "qTop": 0,
            "qHeight": valCount,
            "qLeft": 0,
            "qWidth": 1
          }
        ]
      }
  });
  return listObj;
}