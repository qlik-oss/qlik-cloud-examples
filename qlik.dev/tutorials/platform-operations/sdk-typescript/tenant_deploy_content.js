import fs from 'fs';
import { getAccessToken } from '@qlik/api/auth';
import { getMyUser, createUser, deleteUser } from '@qlik/api/users';
import { getSpaces, getSpace, createSpaceAssignment } from '@qlik/api/spaces';
import { getAppInfo, exportApp, importApp, publishApp, republishApp } from '@qlik/api/apps';
import { getItems } from '@qlik/api/items';
import { GROUP_ANALYTICS_CONSUMER, SPACE_SHARED_DEV, SPACE_MANAGED_PROD } from './constants.js';

async function verifyAccessToApp(hostConfig, appId) {
  const { data: me } = await getMyUser({ hostConfig });
  const { data: app } = await getAppInfo(appId, { hostConfig });
  console.log(`Retrieved the app with ID '${appId}' from tenant '${hostConfig.host}'.`);

  if (app.attributes.spaceId) {
    const { data: space } = await getSpace(app.attributes.spaceId, { hostConfig });
    console.log(`Retrieved the space with ID '${space.id}' from tenant '${hostConfig.host}'.`);
    if (space.type !== 'shared') {
      console.log(`The source app '${appId}' is in a managed space; it must be in a shared or personal space in tenant '${hostConfig.host}'.`);
      process.exit(1);
    }
    try {
      await createSpaceAssignment(space.id, { type: 'user', assigneeId: me.id, roles: ['producer'] }, { hostConfig });
      console.log(`Assigned user '${me.id}' to space '${space.id}' with role 'producer' in tenant '${hostConfig.host}'.`);
    } catch {
      // 409 means assignment already exists
    }
    console.log(`Verified user '${me.id}' has access to app '${appId}' in tenant '${hostConfig.host}'.`);
  }
}

async function findSpaceByName(hostConfig, spaceName) {
  let space = false;
  try {
    const { data: spacesResponse } = await getSpaces({ name: spaceName }, { hostConfig });
    const { data: found } = await getSpace(spacesResponse.data[0].id, { hostConfig });
    space = found;
    console.info(`Found existing space '${spaceName}'`);
  } catch {
    console.info(`Failed to get the space '${spaceName}'`);
  }
  return space;
}

async function exportAppToFile(hostConfig, appId) {
  const { data: app } = await getAppInfo(appId, { hostConfig });
  console.log(`Retrieved the app with ID '${appId}' from tenant '${hostConfig.host}'.`);

  const { headers } = await exportApp(appId, {}, { hostConfig });
  const locationPath = headers.get('location');

  const token = await getAccessToken({ hostConfig });
  const downloadResponse = await fetch(`https://${hostConfig.host}${locationPath}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const filename = `${app.attributes.name}.qvf`;
  fs.writeFileSync(filename, Buffer.from(await downloadResponse.arrayBuffer()));
  console.log(`Exported app '${app.attributes.name}' (ID '${appId}') from '${hostConfig.host}' to '${filename}'.`);
  return { filename, appName: app.attributes.name };
}

async function importAppFromFile(hostConfig, appFilename, spaceId) {
  const { data: devSpace } = await getSpace(spaceId, { hostConfig });
  console.log(`Retrieved the space with ID '${devSpace.id}' from tenant '${hostConfig.host}'.`);
  const appData = fs.readFileSync(appFilename);
  const { data: importedApp } = await importApp({ spaceId }, appData, { hostConfig });
  console.log(`Imported '${appFilename}' as app '${importedApp.attributes.name}' (ID '${importedApp.attributes.id}') in space '${devSpace.name}' in '${hostConfig.host}'.`);
  return importedApp;
}

async function publishAppToSpace(hostConfig, app, spaceId) {
  const { data: space } = await getSpace(spaceId, { hostConfig });
  console.log(`Retrieved the space with ID '${spaceId}' from tenant '${hostConfig.host}'.`);
  if (space.type !== 'managed') {
    console.error(`The space '${spaceId}' in tenant '${hostConfig.host}' must be a managed space.`);
    process.exit(1);
  }
  const { data: itemsResp } = await getItems(
    { resourceType: 'app', spaceId, name: app.attributes.name },
    { hostConfig },
  );
  const previouslyPublishedItem = itemsResp.data.find(
    (item) => item.resourceAttributes.originAppId === app.attributes.id,
  );
  let publishedApp;
  if (previouslyPublishedItem) {
    const { data: repub } = await republishApp(
      app.attributes.id,
      { targetId: previouslyPublishedItem.resourceAttributes.id, spaceId },
      { hostConfig },
    );
    publishedApp = repub;
    console.log(`Republished app '${app.attributes.id}' to '${publishedApp.attributes.id}' in tenant '${hostConfig.host}'.`);
  } else {
    const { data: pub } = await publishApp(app.attributes.id, { spaceId }, { hostConfig });
    publishedApp = pub;
    console.log(`Published app '${app.attributes.id}' to '${publishedApp.attributes.id}' in tenant '${hostConfig.host}'.`);
  }
  console.log(`App '${app.attributes.name}' published to space '${space.name}' as '${publishedApp.attributes.id}' in tenant '${hostConfig.host}'.`);
  return publishedApp;
}

async function verifyUserAccessToPublishedApp(hostConfig, appId, groupId) {
  const adminConfig = { ...hostConfig, scope: 'admin_classic user_default' };
  const testEmail = `test-consumer-${Date.now()}@example.com`;

  const { data: testUser } = await createUser(
    {
      name: testEmail,
      email: testEmail,
      subject: testEmail,
      status: 'active',
      assignedGroups: groupId ? [{ id: groupId }] : [],
    },
    { hostConfig: adminConfig },
  );
  console.log(`Created temporary test user '${testUser.id}' in tenant '${hostConfig.host}'.`);

  const impersonatedConfig = { ...hostConfig, userId: testUser.id, scope: 'user_default' };
  const token = await getAccessToken({ hostConfig: impersonatedConfig });

  let verifiedAccess = false;
  const maxWaitTime = Date.now() + 120 * 1000;
  while (!verifiedAccess && Date.now() < maxWaitTime) {
    try {
      const resp = await fetch(`https://${hostConfig.host}/api/v1/apps/${appId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      verifiedAccess = resp.ok;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  console.log(`${verifiedAccess ? 'Success' : 'Fail'}: verify '${GROUP_ANALYTICS_CONSUMER}' group access to app '${appId}' in tenant '${hostConfig.host}'.`);

  await deleteUser(testUser.id, { hostConfig: adminConfig });
  console.log(`Deleted temporary user '${testUser.id}' from '${hostConfig.host}'.`);
}

export const runTenantDeployContent = async ({
  sourceHostConfig, sourceAppId, targetHostConfig, analyticsConsumerGroupId,
}) => {
  await verifyAccessToApp(sourceHostConfig, sourceAppId);
  const { filename: exportedAppFilename } = await exportAppToFile(sourceHostConfig, sourceAppId);
  const targetSharedSpace = await findSpaceByName(targetHostConfig, SPACE_SHARED_DEV);
  const targetManagedSpace = await findSpaceByName(targetHostConfig, SPACE_MANAGED_PROD);
  const importedApp = await importAppFromFile(targetHostConfig, exportedAppFilename, targetSharedSpace.id);
  fs.unlinkSync(exportedAppFilename);
  const publishedApp = await publishAppToSpace(targetHostConfig, importedApp, targetManagedSpace.id);
  await verifyUserAccessToPublishedApp(targetHostConfig, importedApp.attributes.id, analyticsConsumerGroupId);
  console.log(`Deployed and published an app from '${sourceHostConfig.host}' to '${targetHostConfig.host}'.`);
  return publishedApp.attributes.id;
};
