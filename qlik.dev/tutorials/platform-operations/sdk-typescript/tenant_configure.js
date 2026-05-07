import { getMyUser } from '@qlik/api/users';
import { patchGroupsSettings, patchGroup, createGroup as createGroupApi, getGroups } from '@qlik/api/groups';
import { getLicenseSettings, updateLicenseSettings } from '@qlik/api/licenses';
import { createSpace, getSpaces, getSpace, createSpaceAssignment } from '@qlik/api/spaces';
import { SPACE_SHARED_DEV, SPACE_MANAGED_PROD, GROUP_ANALYTICS_CONSUMER, ROLE_ANALYTICS_ADMIN } from './constants.js';

async function getTenantId(hostConfig) {
  const { data: me } = await getMyUser({ hostConfig });
  console.info(`Retrieved tenant ID '${me.tenantId}' from tenant '${hostConfig.host}'.`);
  return me.tenantId;
}

async function enableAutoGroupCreation(hostConfig) {
  await patchGroupsSettings([
    { op: 'replace', path: '/autoCreateGroups', value: true },
    { op: 'replace', path: '/syncIdpGroups', value: true },
  ], { hostConfig });
  console.info(`Enabled group auto creation on tenant '${hostConfig.host}'.`);
}

async function enableAutoLicenseAssignment(hostConfig) {
  const { data: originalSettings } = await getLicenseSettings({ hostConfig });
  await updateLicenseSettings(
    {
      ...originalSettings,
      autoAssignAnalyzer: true,
      autoAssignProfessional: false,
    },
    { hostConfig },
  );
  console.info(`Enabled license auto assignment on tenant '${hostConfig.host}'.`);
}

async function createOrGetSpace(hostConfig, spaceType, spaceName) {
  let space = false;
  try {
    const { data: created } = await createSpace({ name: spaceName, type: spaceType }, { hostConfig });
    space = created;
    console.info(`Created the ${spaceType} space '${space.name}' with ID '${space.id}' in tenant '${hostConfig.host}'.`);
  } catch (error) {
    console.info(`Failed to create the ${spaceType} space '${spaceName}', will try to get the space if it exists`);
  }
  if (!space) {
    try {
      const { data: spacesResponse } = await getSpaces({ name: spaceName, type: spaceType }, { hostConfig });
      const { data: found } = await getSpace(spacesResponse.data[0].id, { hostConfig });
      space = found;
      console.info(`Found existing ${spaceType} space '${spaceName}'`);
    } catch (error) {
      console.info(`Failed to get the ${spaceType} space '${spaceName}'`);
    }
  }
  return space;
}

async function createSharedSpace(hostConfig) {
  return createOrGetSpace(hostConfig, 'shared', SPACE_SHARED_DEV);
}

async function createManagedSpace(hostConfig) {
  return createOrGetSpace(hostConfig, 'managed', SPACE_MANAGED_PROD);
}

async function createOrGetGroup(hostConfig, groupName) {
  const adminConfig = { ...hostConfig, scope: 'admin_classic user_default' };
  let groupId;
  try {
    const { data: group } = await createGroupApi({ name: groupName }, { hostConfig: adminConfig });
    groupId = group.id;
    console.info(`Created group '${groupName}' with ID '${groupId}' in '${hostConfig.host}'.`);
  } catch (error) {
    console.info(`Failed to create group '${groupName}', will try to get it if it exists`);
  }
  if (!groupId) {
    try {
      const { data: groupsResponse } = await getGroups({ filter: `name eq "${groupName}"` }, { hostConfig });
      const existing = (groupsResponse?.data ?? []).find(({ name }) => name === groupName);
      if (!existing) {
        console.error(`Group '${groupName}' could not be found in tenant '${hostConfig.host}'.`);
        process.exit(1);
      }
      groupId = existing.id;
      console.info(`Found existing group '${groupName}' with ID '${groupId}' in '${hostConfig.host}'.`);
    } catch (error) {
      console.error(`Failed to get group '${groupName}' from '${hostConfig.host}'.`);
      process.exit(1);
    }
  }
  return groupId;
}

async function assignRolesToGroup(hostConfig, groupId, roles) {
  await patchGroup(
    groupId,
    [{ op: 'replace', path: '/assignedRoles', value: roles.map((name) => ({ name })) }],
    { hostConfig },
  );
  console.info(`Assigned roles '${roles}' to group '${groupId}' in tenant '${hostConfig.host}'.`);
}

async function assignToSpace(hostConfig, space, groupId, roles) {
  try {
    await createSpaceAssignment(
      space.id,
      { type: 'group', assigneeId: groupId, roles },
      { hostConfig },
    );
    console.info(`Assigned group '${groupId}' to space '${space.id}' with roles '${roles}' in tenant '${hostConfig.host}'.`);
  } catch (error) {
    if (error.data?.detail === 'assignment of assignee already exists in space') {
      console.info('Assignment already exists in space');
    } else {
      console.warn('Failed to create assignment');
      console.warn(error);
    }
  }
}

export const runTenantConfigure = async (hostConfig) => {
  const tenantId = await getTenantId(hostConfig);
  console.info(`Configuring tenantId: ${tenantId}`);
  await enableAutoGroupCreation(hostConfig);
  await enableAutoLicenseAssignment(hostConfig);

  const devSpace = await createSharedSpace(hostConfig);
  const prodSpace = await createManagedSpace(hostConfig);
  const analyticsConsumerGroupId = await createOrGetGroup(hostConfig, GROUP_ANALYTICS_CONSUMER);
  await assignRolesToGroup(hostConfig, analyticsConsumerGroupId, [ROLE_ANALYTICS_ADMIN]);
  await assignToSpace(hostConfig, prodSpace, analyticsConsumerGroupId, ['consumer']);

  console.info(`The tenant '${hostConfig.host}' has been configured.`);
  return { devSpaceId: devSpace.id, prodSpaceId: prodSpace.id, analyticsConsumerGroupId };
};
