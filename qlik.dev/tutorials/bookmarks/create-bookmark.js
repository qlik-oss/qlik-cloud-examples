// create-bookmark.js
// Create and publish a bookmark in a Qlik Cloud application.
// Authorizes through OAuth2 M2M. To create an OAuth client:
// https://qlik.dev/authenticate/oauth/create-oauth-client
// To use a sample app with this snippet, download and import the executive
// dashboard from: https://github.com/qlik-oss/qlik-cloud-examples/raw/main/qlik.dev/sample-apps/qlik-dev-exec-dashboard.qvf
/*PARAMS
* host: the hostname of your tenant
* clientId: the clientId of the OAuth2 client you created
* clientSecret: the client secret for the OAuth2 client you created
* appId: The GUID for the Qlik Sense app
*/

import { setDefaultHostConfig } from '@qlik/api/auth';
import { openAppSession } from '@qlik/api/qix';

const host = '<tenant.region.qlikcloud.com>';
const clientId = '<OAUTH_CLIENT_ID>';
const clientSecret = '<OAUTH_CLIENT_SECRET>';
const appId = '<APPID_GUID_LIKE_THIS_b1b79fcd-e500-491c-b6e9-2ceaa109214c>';

setDefaultHostConfig({
  authType: 'oauth2',
  host,
  clientId,
  clientSecret,
});

const session = openAppSession({ appId });
const app = await session.getDoc();

const bmk = await app.createBookmarkEx({
  creationDate: new Date().toISOString(),
  qInfo: {
    qType: 'bookmark',
  },
  qMetaDef: {
    qName: 'hello-bookmark',
    title: 'hello-bookmark',
    description: 'Hello! This is a bookmark created with a snippet from qlik.dev.',
    isExtended: true,
  },
});
const bmkLayout = await bmk.getLayout();
console.log(bmkLayout);
const pubBmk = await bmk.publish();
console.log(pubBmk);

await session.close();
process.exit();
