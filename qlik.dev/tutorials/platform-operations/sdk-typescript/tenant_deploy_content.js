const fs = require('fs');
const { GROUP_ANALYTICS_CONSUMER } = require('./constants');
const { getJwtFetch } = require('./qlik-sdk-helper');
const { SPACE_SHARED_DEV, SPACE_MANAGED_PROD } = require('./constants');

async function verifyAccessToApp(sdkClient, appId) {
  const { id: userId } = await sdkClient.users.getMe();
  const app = await sdkClient.apps.get(appId);
  console.log(`Retrieved the app with ID '${appId}' from tenant '${sdkClient.auth.config.host}'.`);

  // If the app is in a shared space the bot user (who is a tenant admin)
  // needs to assign themselves to the space before they can access the app
  if (app.attributes.spaceId) {
    const space = await sdkClient.spaces.get(app.attributes.spaceId);
    console.log(`Retrieved the space with ID '${space.id}' from tenant '${sdkClient.auth.config.host}'.`);
    if (space.type !== 'shared') {
      console.log(`The source app with ID '${appId}' is in a managed space, it must be in a shared or personal space in tenant '${sdkClient.auth.config.host}'.`);
      process.exit(1);
    }

    try {
      await space.createAssignment({ type: 'user', assigneeId: userId, roles: ['producer'] });
      console.log(`The user with ID '${userId}' has been assigned to the space with ID '${space.id}' with the roles '{roles}' in tenant '${sdkClient.auth.config.host}'.`);
    } catch (error) {
      // TODO
      // if error.status === 409 then exists else throw error
    }
    console.log(`Verified that the user with ID '${userId}' has access to the app with '${appId}' in tenant '${sdkClient.auth.config.host}'.`);
  }
}

async function getSpace(sdkClient, spaceName) {
  let space = false;
  try {
    const spacesResponse = await sdkClient.spaces.getSpaces({ name: spaceName });
    space = await sdkClient.spaces.get(spacesResponse.data[0].id);
    console.info(`Found existing space '${spaceName}' `);
  } catch (error) {
    console.info(`Failed to get the space '${spaceName}'`);
  }
  return space;
}

async function exportApp(sdkClient, appId) {
  const app = await sdkClient.apps.get(appId);
  console.log(`Retrieved the app with ID '${appId}' from tenant '${sdkClient.auth.config.host}'.`);

  const appLocationUrl = await app.export();

  // Download the app to a local file so it can be imported
  const downloadResponse = await sdkClient.rest(appLocationUrl, { method: 'get' });
  const filename = `${app.attributes.name}.qvf`;
  fs.writeFileSync(filename, Buffer.from(await downloadResponse.arrayBuffer()));
  console.log(`Exported the app '${app.attributes.name}' with ID '${appId}' from '${sdkClient.auth.config.host}' to '${filename}'.`);
  return filename;
}

async function importApp(sdkClient, appFilename, spaceId) {
  const devSpace = await sdkClient.spaces.get(spaceId);
  console.log(`Retrieved the space with ID '${devSpace.id}' from tenant '${sdkClient.auth.config.host}'.`);
  const appData = fs.readFileSync(appFilename);
  const importedApp = await sdkClient.apps.importApp(appData, { spaceId });
  console.log(`Imported the app '${appFilename}' to app '${importedApp.attributes.name}' with ID '${importedApp.attributes.id}' in space '${devSpace.name}' with ID '${devSpace.id}' in '${sdkClient.auth.config.host}'.`);
  return importedApp;
}

async function publishApp(sdkClient, app, spaceId) {
  const space = await sdkClient.spaces.get(spaceId);
  console.log(`Retrieved the space with ID '${spaceId}' from tenant '${sdkClient.auth.config.host}'.`);
  if (space.type !== 'managed') {
    console.error(`The space ID '${spaceId}' given for tenant '${sdkClient.auth.config.host}' must be a managed space.`);
    process.exit(1);
  }
  // Determine if the app is previously published
  const items = await sdkClient.items.getItems({ resourceType: 'app', spaceId, name: app.attributes.name });
  const previouslyPublishedItem = items.data.find(
    (item) => item.resourceAttributes.originAppId === app.attributes.id,
  );
  let publishedApp;
  if (previouslyPublishedItem) {
    // Republish (replaces the previously published app)
    publishedApp = await app.setPublish({
      targetId: previouslyPublishedItem.resourceAttributes.id,
      spaceId,
    });
    console.log(`Republished the app with ID '${app.attributes.id}' to the app with ID '${publishedApp.attributes.id}' in tenant '${sdkClient.auth.config.host}'.`);
  } else {
    // publish
    publishedApp = await app.publish({ spaceId });
    console.log(`Published the app with ID '${app.attributes.id}' to the app with ID '${publishedApp.attributes.id}' in tenant '${sdkClient.auth.config.host}'.`);
  }
  console.log(`The app '${app.attributes.name}' with ID '${app.attributes.id}' has been published to space '${space.name}' with app ID '${publishedApp.attributes.id}' in tenant '${sdkClient.auth.config.host}'."`);
  return publishedApp;
}

async function verifyUserAccessToPublishedApp(sdkClient, appId, jwtIdpConfig) {
  const jwtFetch = await getJwtFetch(sdkClient.auth.config.host, jwtIdpConfig);
  const userResponse = await jwtFetch('/api/v1/users/me', { method: 'get' });
  const userData = await userResponse.json();
  console.log(`Created a JWT authentication session for a user in group '${GROUP_ANALYTICS_CONSUMER}' in tenant '${sdkClient.auth.config.host}'.`);
  // add retry
  let verifiedAccess = false;
  const maxWaitTime = Date.now() + 120 * 1000; // 2 minutes from now
  while (!verifiedAccess && Date.now() < maxWaitTime) {
    try {
      await jwtFetch(`/api/v1/apps/${appId}`, { method: 'get' });
      verifiedAccess = true;
    } catch (error) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  console.log(`${verifiedAccess ? 'Success' : 'Fail'} : verify user access for the group '${GROUP_ANALYTICS_CONSUMER}' to the published app with ID '${appId}' in tenant '${sdkClient.auth.config.host}'.`);
  // Delete the temporary user
  const user = await sdkClient.users.get(userData.id);
  await user.delete();
  console.log(`Deleted temporary user with ID '${user.id}' from '${sdkClient.auth.config.host}'.`);
}

const runTenantDeployContent = async ({
  sourceTenantClient, sourceAppId, targetTenantClient, jwtConfig,
}) => {
  await verifyAccessToApp(sourceTenantClient, sourceAppId);
  const exportedAppFilename = await exportApp(sourceTenantClient, sourceAppId);
  const targetSharedSpace = await getSpace(targetTenantClient, SPACE_SHARED_DEV);
  const targetManagedSpace = await getSpace(targetTenantClient, SPACE_MANAGED_PROD);
  const importedApp = await importApp(targetTenantClient, exportedAppFilename, targetSharedSpace.id);
  fs.unlinkSync(exportedAppFilename);
  const publishedApp = await publishApp(targetTenantClient, importedApp, targetManagedSpace.id);
  await verifyUserAccessToPublishedApp(targetTenantClient, importedApp.attributes.id, jwtConfig);
  console.log(`Deployed and published an app from '${sourceTenantClient.auth.config.host}' to '${targetTenantClient.auth.config.host}'.`);
  return publishedApp.attributes.id;
};

module.exports = { runTenantDeployContent };
