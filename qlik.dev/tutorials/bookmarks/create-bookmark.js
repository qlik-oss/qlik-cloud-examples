//create-bookmark.js
//Create and publish a bookmark
//Authorizes through OAuth2 M2M to connect to a Qlik Cloud application.
//To create an OAuth client for this snippet, go here:
//https://qlik.dev/authenticate/oauth/create-oauth-client
//To use a sample app with this snippet, download and import the executive
//dashboard from this github location
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

const host = "<tenant.region.qlikcloud.com>";
const clientId = "<OAUTH_CLIENT_ID>";
const clientSecret = "<OAUTH_CLIENT_SECRET>";
const appId = "<APPID_GUID_LIKE_THIS_b1b79fcd-e500-491c-b6e9-2ceaa109214c";

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
  const bmk = await app.createBookmarkEx(
    {
      "creationDate": new Date().toISOString(),
      "qInfo": {
        "qType": "bookmark",
      },
      "qMetaDef": {
        "qName": "hello-bookmark",
        "title": "hello-bookmark",
        "description": "Hello! This is a bookmark created with a snippet from qlik.dev.",
        "isExtended": true
      }
    });
  const bmkLayout = await bmk.getLayout();
  console.log(bmkLayout);
  const pubBmk = await bmk.publish();
  console.log(pubBmk);
  process.exit();
})();