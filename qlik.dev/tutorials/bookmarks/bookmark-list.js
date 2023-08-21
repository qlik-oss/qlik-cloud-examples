//bookmark-list.js
//List published and bookmarks owned by the user
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
  const bList = await app.getBookmarks({
    qTypes: ["bookmark"],
    qData: {
      title: "/qMetaDef/title",
      description: "/qMetaDef/description",
      sheetId: "/sheetId",
      selectionFields: "/selectionFields",
      creationDate: "/creationDate",
    },
  });
  console.log(bList);
  process.exit();
}
)();