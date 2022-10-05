const { createSdkClient } = require('./qlik-sdk-helper');
const { ROLE_TENANT_ADMIN } = require('./constants');

async function getSignedEntitlementKey(sdkClient) {
  const res = await sdkClient.licenses.getOverview();
  console.info(`Retrieved the signed entitlement key from tenant '${sdkClient.auth.config.host}'.`);
  return res.licenseKey;
}

async function createTenant(sdkClient, licenseKey) {
  const res = await sdkClient.rest('/tenants', { method: 'post', body: JSON.stringify({ licenseKey }) }).then((resp) => resp.json());
  console.info(`Created tenant '${res.hostnames[0]}' with ID '${res.id}'.`);
  return {
    tenantId: res.id,
    tenantHostname: res.hostnames[0],
  };
}

async function checkAccessToTenant(sdkClient, tenantId) {
  const me = await sdkClient.users.getMe();
  if (me.tenantId !== tenantId) {
    console.error(`The tenant '${sdkClient.auth.config.host}' does not have the expected ID: '${tenantId}' != '${me.tenantId}'.`);
    return false;
  }
  console.info(`Successfully accessed tenant '${sdkClient.auth.config.host}'.`);
  return true;
}

async function createTenantAdmin(sourceTenantClient, targetTenantClient, tenantAdminMail) {
  const resp = await sourceTenantClient.users.getUsers({ filter: `email eq "${tenantAdminMail}"` });
  if (resp.data && resp.data.length === 0) {
    throw Error(`No user with email '${tenantAdminMail}' exists in the tenant '${sourceTenantClient.auth.config.host}.`);
  }
  const { data: [sourceTenantAdminUser] } = resp;
  console.info(`Retrieved user for email '${tenantAdminMail}' from tenant '${sourceTenantClient.auth.config.host}'.`);
  if (!sourceTenantAdminUser.roles.includes(ROLE_TENANT_ADMIN)) {
    throw Error(`The user with email '${tenantAdminMail}' is not a tenant admin in the tenant '${sourceTenantClient.auth.config.host}.`);
  }
  const { data: targetTenantRoles } = await targetTenantClient.roles.getRoles({ filter: `name eq "${ROLE_TENANT_ADMIN}"` });
  console.info(`Retrieved roles from tenant '${targetTenantClient.auth.config.host}'.`, targetTenantRoles);

  const targetTenantAdminRole = targetTenantRoles.find((role) => role.name === ROLE_TENANT_ADMIN);
  if (!targetTenantAdminRole) {
    throw new Error(`No role with the name '${ROLE_TENANT_ADMIN}' exists in the tenant '${targetTenantClient.auth.config.host}'.`);
  }
  const user = await targetTenantClient.users.create({
    name: sourceTenantAdminUser.name,
    email: sourceTenantAdminUser.email,
    subject: sourceTenantAdminUser.subject,
    assignedRoles: [{ id: targetTenantAdminRole.roleId }],
  });

  console.info(`Created tenant admin user for user with email '${tenantAdminMail}' with ID '${user.id}' in tenant '${targetTenantClient.auth.config.host}'.`);
}

async function runTenantCreate({
  sourceTenantClient, registrationClient, oauthClientId, oauthSecret, sourceTenantAdminEmail,
}) {
  const licenseKey = await getSignedEntitlementKey(sourceTenantClient);
  const { tenantId, tenantHostname } = await createTenant(registrationClient, licenseKey);
  const targetTenantClient = await createSdkClient(oauthClientId, oauthSecret, tenantHostname);
  if (await checkAccessToTenant(targetTenantClient, tenantId)) {
    await createTenantAdmin(sourceTenantClient, targetTenantClient, sourceTenantAdminEmail);
  }
  console.log(`The tenant '${targetTenantClient.auth.config.host}' has been created.`);
  return targetTenantClient;
}

module.exports = { runTenantCreate };
