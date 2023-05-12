const { Auth, AuthType } = require('@qlik/sdk');
const { default: generateSignedToken } = require('@qlik/sdk/generateSignedToken');
const { SPACE_SHARED_DEV, SPACE_MANAGED_PROD, GROUP_ANALYTICS_CONSUMER } = require('./constants');

async function getTenantId(sdkClient) {
  const { tenantId } = await sdkClient.users.getMe();
  console.info(`Retrieved tenant ID '${tenantId}' from tenant '${sdkClient.auth.config.host}'.`);
  return tenantId;
}

async function enableAutoGroupCreation(sdkClient) {
  await sdkClient.groups.patchSettings([{ op: 'replace', path: '/autoCreateGroups', value: true }]);
  console.info(`Enabled group auto creation on tenant '${sdkClient.auth.config.host}'.`);
}

async function enableAutoLicenseAssignment(sdkClient) {
  const originalSettings = await sdkClient.licenses.getSettings();
  await sdkClient.licenses.setSettings(
    {
      ...originalSettings,
      autoAssignAnalyzer: true,
      autoAssignProfessional: true,
    },
  );
  console.info(`Enabled license auto assignment on tenant '${sdkClient.auth.config.host}'.`);
}

async function configureJwtIdp(sdkClient, {
  jwtIssuer,
  jwtKeyId,
  jwtPublicKey,
}) {
  const tenantId = await getTenantId(sdkClient);

  let identityProvider = false;
  try {
    identityProvider = await sdkClient.rest('/identity-providers', {
      method: 'post',
      body: JSON.stringify({
        tenantIds: [tenantId],
        provider: 'external',
        protocol: 'jwtAuth',
        interactive: false,
        active: true,
        description: 'IdP to handle deferred authentication.',
        options: {
          jwtLoginEnabled: true,
          issuer: jwtIssuer,
          staticKeys: [
            {
              kid: jwtKeyId,
              pem: jwtPublicKey,
            },
          ],
        },
      }),
    }).then((response) => response.json());
    console.info(`Created JWT identity provider with ID '${identityProvider.id}' in tenant '${sdkClient.auth.config.host}'.`);
  } catch (error) {
    console.info(`Failed to create JWT identity provider in tenant '${sdkClient.auth.config.host}'.`);
  }

  try {
    const idps = await sdkClient.rest('/identity-providers', {
      method: 'get',
    }).then((response) => response.json());
    identityProvider = idps?.data?.find(
      (idp) => idp?.options?.issuer === jwtIssuer && idp?.options?.staticKeys?.[0]?.kid === jwtKeyId,
    );
    console.info(`Found existing JWT identity provider with ID '${identityProvider.id}' in tenant '${sdkClient.auth.config.host}' with these values.`);
  } catch (error) {
    console.warn('Did not find any matching jwt idp');
  }
}

async function createOrGetSpace(sdkClient, spaceType, spaceName) {
  let space = false;
  try {
    space = await sdkClient.spaces.create({
      name: spaceName,
      type: spaceType,
    });
    console.info(`Created the ${spaceType} space '${space.name}' with ID '${space.id}' in tenant '${sdkClient.auth.config.host}'.`);
  } catch (error) {
    console.info(`Failed to created the ${spaceType} space '${spaceName}', will try to get the space if it exists`);
  }
  if (!space) {
    try {
      const spacesResponse = await sdkClient.spaces.getSpaces({ name: spaceName, type: spaceType });
      space = await sdkClient.spaces.get(spacesResponse.data[0].id);
      console.info(`Found existing ${spaceType} space '${spaceName}' `);
    } catch (error) {
      console.info(`Failed to get the ${spaceType} space '${spaceName}'`);
    }
  }
  return space;
}

async function createSharedSpace(sdkClient) {
  return createOrGetSpace(sdkClient, 'shared', SPACE_SHARED_DEV);
}

async function createManagedSpace(sdkClient) {
  return createOrGetSpace(sdkClient, 'managed', SPACE_MANAGED_PROD);
}

async function createGroup(sdkClient, groupName, {
  jwtIssuer,
  jwtKeyId,
  jwtPrivateKey,
}) {
  const parseCookie = (str) => str
    .split(';')
    .map((v) => v.split('='))
    .reduce((acc, v) => {
      if (v.length > 1) {
        const key = v[0].split(',').slice(-1)[0].trim();
        acc[decodeURIComponent(key)] = decodeURIComponent(v[1].trim());
      }
      return acc;
    }, {});

  const claims = {
    sub: 'temp_user',
    subType: 'user',
    name: 'temp_user',
    email: 'temp_user@jwt.io',
    email_verified: true,
    groups: [groupName],
    expiresIn: '30s',
    notBefore: '0s',
    keyid: jwtKeyId,
    issuer: jwtIssuer,
  };
  const signedToken = generateSignedToken(
    claims,
    jwtPrivateKey,
  );
  const jwtAuth = new Auth({
    authType: AuthType.JWTAuth,
    fetchToken: () => Promise.resolve(signedToken),
    host: sdkClient.auth.config.host,
    webIntegrationId: 'tests',
  });
  const resp = await jwtAuth.getSessionCookie();
  const fetchedCookies = parseCookie(resp.headers.get('set-cookie'));

  const cookie = `eas.sid=${fetchedCookies['eas.sid']}; eas.sid.sig=${fetchedCookies['eas.sid.sig']}`;

  const userResponse = await fetch(
    `https://${sdkClient.auth.config.host}/api/v1/users/me`,
    {
      method: 'GET',
      credentials: 'include',
      redirect: 'follow',
      headers: {
        cookie,
        csrfToken: fetchedCookies._csrfToken,
        'Content-Type': 'application/json',
      },
    },
  );

  const user = await userResponse.json();
  console.info(`Created a JWT authentication session for a user in group '${groupName}' in tenant '${sdkClient.auth.config.host}'.`);

  // Lookup the newly created group to get the ID
  const groupsResponse = await sdkClient.groups.getGroups({ filter: `name eq "${groupName}"` });
  const groups = groupsResponse?.data ?? [];
  const group = groups.find(({ name }) => name === groupName);
  if (!group) {
    console.error(`"The group ${groupName} could not be found in tenant '${sdkClient.auth.config.host}'.`);
    process.exit(1);
  }
  const groupId = group.id;
  console.info(`Created group '${groupName}' with ID '${groupId}' in '${sdkClient.auth.config.host}'.`);

  // Delete the temporary user, it's not needed
  await sdkClient.rest(`/api/v1/users/${user.id}`, { method: 'DELETE' });
  console.info(`Deleted temporary user with ID '${user.id}' from '${sdkClient.auth.config.host}`);
  return groupId;
}

async function assignToSpace(sdkClient, space, groupId, roles) {
  try {
    await space.createAssignment({
      type: 'group',
      assigneeId: groupId,
      roles,
    });
    console.info(`Assigned the group with ID '${groupId}' to the space with ID '${space.id}' with the roles '${roles}' in tenant '${sdkClient.auth.config.host}'.`);
  } catch (error) {
    if (error.detail === 'assignment of assignee already exists in space') {
      console.info('Assignment already exists in space');
    } else {
      console.warn('Failed to create assignment');
      console.warn(error);
    }
  }
}

const runTenantConfigure = async (sdkClient, jwtConfig) => {
  const tenantId = await getTenantId(sdkClient);
  console.info(`Configuring tenantId: ${tenantId}`);
  await enableAutoGroupCreation(sdkClient);
  await enableAutoLicenseAssignment(sdkClient);

  await configureJwtIdp(sdkClient, jwtConfig);
  const devSpace = await createSharedSpace(sdkClient);
  const prodSpace = await createManagedSpace(sdkClient);
  const analyticsConsumerGroupId = await createGroup(sdkClient, GROUP_ANALYTICS_CONSUMER, jwtConfig);
  await assignToSpace(sdkClient, prodSpace, analyticsConsumerGroupId, ['consumer']);

  console.info(`The tenant '${sdkClient.auth.config.host}' has been configured.`);
  return { devSpaceId: devSpace.id, prodSpaceId: prodSpace.id };
};

module.exports = { runTenantConfigure };
